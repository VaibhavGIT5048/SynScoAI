import asyncio
import json
import random
import time
from contextlib import suppress
from collections import Counter
import logging
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.config import settings
from app.models.graph import PipelineRequest, PipelineResponse
from app.security import (
    enforce_ip_rate_limit,
    release_visitor_simulation_slot,
    reserve_visitor_simulation_slot,
    run_guarded_simulation,
)
from app.services.graph_service import extract_graph
from app.services.agent_service import generate_agents_from_graph
from app.services.simulation_service import run_simulation, _agent_speak, _extract_tensions
from app.services.report_service import generate_report
from app.services.run_store import create_run_id, save_pipeline_run

router = APIRouter(prefix="/pipeline", tags=["Pipeline"])
logger = logging.getLogger(__name__)


def sse(event: str, data: dict) -> str:
    return f"data: {json.dumps({'event': event, **data})}\n\n"


def _remaining_timeout(deadline: float) -> float:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise asyncio.TimeoutError()
    return remaining


@router.post("", response_model=PipelineResponse)
async def run_pipeline(http_request: Request, request: PipelineRequest) -> PipelineResponse:
    try:
        async def operation() -> PipelineResponse:
            logger.info("Starting pipeline for topic: %s", request.topic)

            graph = await extract_graph(topic=request.topic, context=request.context)
            logger.info("Graph extracted with %s nodes", len(graph.nodes))

            agents = await generate_agents_from_graph(
                topic=request.topic,
                graph=graph,
                agents_per_node=request.agents_per_node,
                context=request.context or "",
            )
            logger.info("Generated %s agents", agents.total_agents)

            simulation = await run_simulation(
                topic=request.topic,
                agents=agents.agents,
                rounds=request.rounds,
                agents_per_round=request.agents_per_round,
                seed=request.random_seed,
            )
            logger.info("Simulation complete with %s turns", simulation.total_turns)

            report = await generate_report(
                topic=request.topic,
                simulation=simulation,
                agents=agents.agents,
                context=request.context or "",
            )
            logger.info("Report generated")

            return PipelineResponse(
                topic=request.topic,
                graph=graph,
                agents=agents,
                simulation=simulation,
                report=report,
            )

        return await run_guarded_simulation(http_request, operation)
    except HTTPException:
        raise
    except RuntimeError:
        logger.exception("Pipeline route runtime failure")
        raise HTTPException(status_code=500, detail="Internal server error.")
    except Exception:
        logger.exception("Pipeline route failed")
        raise HTTPException(status_code=500, detail="Internal server error.")


@router.post("/stream")
async def stream_pipeline(http_request: Request, request: PipelineRequest):
    await enforce_ip_rate_limit(http_request)
    owner_id = None
    visitor = await reserve_visitor_simulation_slot(http_request)
    deadline = time.monotonic() + settings.request_timeout_seconds
    run_id = create_run_id()

    async def generate():
        report_task: asyncio.Task | None = None
        try:
            # Emit run_id immediately so clients can recover results if stream drops later.
            yield sse("run_started", {"run_id": run_id})

            # Step 1 — Graph
            yield sse("status", {"message": "Extracting social knowledge graph..."})
            graph = await asyncio.wait_for(
                extract_graph(topic=request.topic, context=request.context),
                timeout=_remaining_timeout(deadline),
            )
            yield sse("graph", {"graph": graph.model_dump()})

            # Step 2 — Agents (stream each node as it completes)
            yield sse("status", {"message": "Spawning intelligent agents..."})
            from app.services.agent_service import _generate_agents_for_node
            all_agents = []
            semaphore = asyncio.Semaphore(settings.pipeline_stream_node_concurrency)

            async def _generate_node_batch(node_index: int, node):
                async with semaphore:
                    node_agents = await _generate_agents_for_node(
                        node=node,
                        topic=request.topic,
                        context=request.context or "",
                        graph=graph,
                        agents_per_node=request.agents_per_node,
                        counter_start=(node_index * request.agents_per_node) + 1,
                    )
                    return node, node_agents

            tasks = [
                asyncio.create_task(_generate_node_batch(node_index, node))
                for node_index, node in enumerate(graph.nodes)
            ]

            try:
                for pending_task in asyncio.as_completed(tasks):
                    node, node_agents = await asyncio.wait_for(
                        pending_task,
                        timeout=_remaining_timeout(deadline),
                    )
                    for agent in node_agents:
                        try:
                            agent_index = int(str(agent.id).split("_")[-1])
                            agent.name = f"Agent {agent_index}"
                        except (ValueError, TypeError):
                            pass
                    all_agents.extend(node_agents)
                    yield sse("agents_batch", {
                        "node_id": node.id,
                        "node_label": node.label,
                        "agents": [a.model_dump() for a in node_agents],
                        "total_so_far": len(all_agents),
                    })
            finally:
                for task in tasks:
                    if not task.done():
                        task.cancel()

            all_agents = sorted(all_agents, key=lambda agent: agent.id)

            if not all_agents:
                yield sse("error", {"message": "No agents could be generated for this simulation."})
                return

            yield sse("agents_complete", {"total_agents": len(all_agents)})

            # Step 3 — Simulation (stream each turn live)
            yield sse("status", {"message": "Running multi-agent simulation..."})
            all_turns = []
            # Keep debate behavior predictable across clients.
            speaker_window = min(2, len(all_agents))
            seed_offset = 0
            if request.random_seed is not None and len(all_agents) > 0:
                seed_offset = random.Random(request.random_seed).randrange(len(all_agents))

            for round_num in range(1, request.rounds + 1):
                yield sse("round_start", {"round": round_num, "total_rounds": request.rounds})
                start_index = (seed_offset + (round_num - 1) * speaker_window) % len(all_agents)
                speaking_agents = [
                    all_agents[(start_index + i) % len(all_agents)]
                    for i in range(speaker_window)
                ]
                for agent in speaking_agents:
                    turn = await asyncio.wait_for(
                        _agent_speak(
                            agent=agent,
                            topic=request.topic,
                            recent_turns=all_turns,
                            round_num=round_num,
                            model=settings.openai_model_simulation,
                        ),
                        timeout=_remaining_timeout(deadline),
                    )
                    if turn:
                        all_turns.append(turn)
                        yield sse("turn", {"turn": turn.model_dump()})

            stance_counts = Counter(t.stance for t in all_turns)
            key_tensions = _extract_tensions(all_turns)
            yield sse("simulation_complete", {
                "total_turns": len(all_turns),
                "key_tensions": key_tensions,
                "dominant_stances": dict(stance_counts),
            })

            # Step 4 — Report
            yield sse("status", {"message": "Generating policy analysis report..."})
            from app.models.graph import SimulationResponse
            simulation = SimulationResponse(
                topic=request.topic,
                total_rounds=request.rounds,
                total_turns=len(all_turns),
                turns=all_turns,
                key_tensions=key_tensions,
                dominant_stances=dict(stance_counts),
            )
            report_task = asyncio.create_task(
                generate_report(
                    topic=request.topic,
                    simulation=simulation,
                    agents=all_agents,
                    context=request.context or "",
                )
            )

            keepalive_interval_seconds = 4.0
            while not report_task.done():
                remaining_timeout = _remaining_timeout(deadline)
                wait_timeout = min(keepalive_interval_seconds, remaining_timeout)
                done, _ = await asyncio.wait({report_task}, timeout=wait_timeout)
                if done:
                    break
                # SSE comment frame to keep intermediaries and browser readers alive.
                yield ": keepalive\n\n"

            report = await report_task
            result_payload = PipelineResponse(
                topic=request.topic,
                graph=graph,
                agents={
                    "topic": request.topic,
                    "total_agents": len(all_agents),
                    "agents": all_agents,
                },
                simulation=simulation,
                report=report,
            ).model_dump()

            await save_pipeline_run(run_id=run_id, result_payload=result_payload, owner_id=owner_id)

            yield sse("report", {"report": report.model_dump(), "run_id": run_id})
            yield sse("complete", {"message": "Pipeline complete!", "run_id": run_id})

        except asyncio.TimeoutError:
            if report_task and not report_task.done():
                report_task.cancel()
                with suppress(asyncio.CancelledError):
                    await report_task
            yield sse("error", {"message": "Simulation request timed out."})
        except Exception:
            if report_task and not report_task.done():
                report_task.cancel()
                with suppress(asyncio.CancelledError):
                    await report_task
            logger.exception("Pipeline stream failed")
            yield sse("error", {"message": "An internal error occurred."})
        finally:
            await release_visitor_simulation_slot(visitor)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )