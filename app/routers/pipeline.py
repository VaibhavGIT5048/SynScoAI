import asyncio
import json
import random
import time
from collections import Counter
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

router = APIRouter(prefix="/pipeline", tags=["Pipeline"])


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
            print(f"🚀 Starting pipeline for topic: {request.topic}")

            graph = await extract_graph(topic=request.topic, context=request.context)
            print(f"✅ Graph extracted — {len(graph.nodes)} nodes")

            agents = await generate_agents_from_graph(
                topic=request.topic,
                graph=graph,
                agents_per_node=request.agents_per_node,
                context=request.context or "",
            )
            print(f"✅ Generated {agents.total_agents} agents")

            simulation = await run_simulation(
                topic=request.topic,
                agents=agents.agents,
                rounds=request.rounds,
                agents_per_round=request.agents_per_round,
            )
            print(f"✅ Simulation complete — {simulation.total_turns} turns")

            report = await generate_report(
                topic=request.topic,
                simulation=simulation,
                agents=agents.agents,
                context=request.context or "",
            )
            print("✅ Report generated")

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
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline failed: {str(e)}")


@router.post("/stream")
async def stream_pipeline(http_request: Request, request: PipelineRequest):
    enforce_ip_rate_limit(http_request)
    visitor = reserve_visitor_simulation_slot(http_request)
    deadline = time.monotonic() + settings.request_timeout_seconds

    async def generate():
        try:
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
            counter = 1
            for node in graph.nodes:
                node_agents = await asyncio.wait_for(
                    _generate_agents_for_node(
                        node=node,
                        topic=request.topic,
                        context=request.context or "",
                        graph=graph,
                        agents_per_node=request.agents_per_node,
                        counter_start=counter,
                    ),
                    timeout=_remaining_timeout(deadline),
                )
                counter += len(node_agents)
                all_agents.extend(node_agents)
                yield sse("agents_batch", {
                    "node_id": node.id,
                    "node_label": node.label,
                    "agents": [a.model_dump() for a in node_agents],
                    "total_so_far": len(all_agents),
                })

            yield sse("agents_complete", {"total_agents": len(all_agents)})

            # Step 3 — Simulation (stream each turn live)
            yield sse("status", {"message": "Running multi-agent simulation..."})
            all_turns = []
            for round_num in range(1, request.rounds + 1):
                yield sse("round_start", {"round": round_num, "total_rounds": request.rounds})
                speaking_agents = random.sample(all_agents, min(request.agents_per_round, len(all_agents)))
                for agent in speaking_agents:
                    turn = await asyncio.wait_for(
                        _agent_speak(
                            agent=agent,
                            topic=request.topic,
                            recent_turns=all_turns,
                            round_num=round_num,
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
            report = await asyncio.wait_for(
                generate_report(
                    topic=request.topic,
                    simulation=simulation,
                    agents=all_agents,
                    context=request.context or "",
                ),
                timeout=_remaining_timeout(deadline),
            )
            yield sse("report", {"report": report.model_dump()})
            yield sse("complete", {"message": "Pipeline complete!"})

        except asyncio.TimeoutError:
            yield sse("error", {"message": "Simulation request timed out."})
        except Exception as e:
            yield sse("error", {"message": str(e)})
        finally:
            release_visitor_simulation_slot(visitor)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )