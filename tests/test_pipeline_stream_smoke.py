import json
import os

import httpx
import pytest

# Keep tests self-contained when local env vars are not exported.
os.environ.setdefault("OPENAI_API_KEY", "test-key")
os.environ.setdefault("OPENAI_MODEL", "gpt-5.4-nano")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:5173")
os.environ.setdefault("RATE_LIMIT_PER_MINUTE_IP", "1000")
os.environ.setdefault("SIM_LIMIT_PER_DAY_VISITOR", "1000")
os.environ.setdefault("MAX_CONCURRENT_SIM_PER_VISITOR", "1")
os.environ.setdefault("REQUEST_TIMEOUT_SECONDS", "10")
os.environ.setdefault("MAX_INPUT_CHARS_TOPIC", "240")
os.environ.setdefault("MAX_INPUT_CHARS_CONTEXT", "5000")
os.environ.setdefault("TRUST_PROXY_HEADERS", "false")

from app.main import app
from app.models.graph import (
    Agent,
    AnalyzeResponse,
    GraphNode,
    ReportResponse,
    SimulationTurn,
    StakeholderInsight,
)
import app.routers.pipeline as pipeline_router
import app.security as security
import app.services.agent_service as agent_service


def _payload() -> dict:
    return {
        "topic": "Long streaming smoke test for pipeline persistence",
        "context": "Validate streaming run, persistence, and exports.",
        "rounds": 4,
        "agents_per_round": 4,
        "agents_per_node": 2,
    }


def _build_graph(topic: str) -> AnalyzeResponse:
    return AnalyzeResponse(
        topic=topic,
        nodes=[
            GraphNode(
                id="supply",
                label="Supply",
                type="stakeholder",
                description="Supply actors",
            ),
            GraphNode(
                id="demand",
                label="Demand",
                type="stakeholder",
                description="Demand actors",
            ),
        ],
        edges=[],
        summary="Minimal graph for smoke test.",
    )


def _build_agent(index: int, represents: str) -> Agent:
    return Agent(
        id=f"agent_{index:03d}",
        name=f"Agent {index}",
        type="stakeholder",
        represents=represents,
        role="Policy Analyst",
        personality="calm",
        goal="Test simulation",
        stance="neutral",
        reasoning_style="analytical",
        knowledge_domain=["testing"],
        skills=["analysis"],
        bias="neutral",
        confidence=0.7,
        risk_tolerance="moderate",
        memory=[],
        relationships=[],
        assumptions=[],
        concerns=[],
    )


def _build_turn(topic: str, round_num: int, agent: Agent) -> SimulationTurn:
    return SimulationTurn(
        round=round_num,
        agent_id=agent.id,
        agent_name=agent.name,
        represents=agent.represents,
        role=agent.role,
        stance=agent.stance,
        message=f"{agent.name} weighing {topic}.",
        emotion="calm",
        action="argues",
    )


def _build_report(topic: str, total_turns: int) -> ReportResponse:
    return ReportResponse(
        topic=topic,
        executive_summary="Smoke test report summary.",
        key_findings=["Finding 1"],
        stakeholder_insights=[
            StakeholderInsight(
                represents="Supply",
                summary="Supply stance.",
                final_stance="neutral",
                influence_score=0.5,
            )
        ],
        predicted_outcome="Test outcome.",
        policy_recommendations=["Recommendation 1"],
        conflict_score=0.4,
        consensus_areas=["Consensus 1"],
        total_turns_analyzed=total_turns,
    )


def _parse_sse_events(body: str) -> list[dict]:
    events: list[dict] = []
    for line in body.splitlines():
        if not line.startswith("data: "):
            continue
        payload = line[6:].strip()
        if not payload:
            continue
        try:
            events.append(json.loads(payload))
        except json.JSONDecodeError:
            continue
    return events


@pytest.fixture(autouse=True)
def _reset_security_state():
    security.reset_inmemory_state_for_tests()
    yield
    security.reset_inmemory_state_for_tests()


@pytest.mark.asyncio
async def test_pipeline_stream_smoke_persists_and_exports(monkeypatch: pytest.MonkeyPatch):
    async def fake_extract_graph(topic: str, context: str | None = None):
        return _build_graph(topic)

    async def fake_generate_agents_for_node(
        node,
        topic: str,
        context: str,
        graph,
        agents_per_node: int,
        counter_start: int,
    ):
        return [
            _build_agent(counter_start + i, node.id)
            for i in range(agents_per_node)
        ]

    async def fake_agent_speak(agent, topic: str, recent_turns, round_num: int, model: str):
        return _build_turn(topic, round_num, agent)

    def fake_extract_tensions(turns):
        return ["supply vs demand"]

    async def fake_generate_report(topic: str, simulation, agents, context: str = ""):
        return _build_report(topic, simulation.total_turns)

    monkeypatch.setattr(pipeline_router, "extract_graph", fake_extract_graph)
    monkeypatch.setattr(agent_service, "_generate_agents_for_node", fake_generate_agents_for_node)
    monkeypatch.setattr(pipeline_router, "_agent_speak", fake_agent_speak)
    monkeypatch.setattr(pipeline_router, "_extract_tensions", fake_extract_tensions)
    monkeypatch.setattr(pipeline_router, "generate_report", fake_generate_report)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/pipeline/stream",
            json=_payload(),
            headers={"X-Visitor-Id": "stream-smoke-visitor"},
        )

        assert response.status_code == 200
        events = _parse_sse_events(response.text)

        run_id = next(
            (event.get("run_id") for event in events if event.get("event") == "run_started"),
            None,
        )
        if not run_id:
            run_id = next(
                (event.get("run_id") for event in events if event.get("event") in {"report", "complete"}),
                None,
            )

        assert isinstance(run_id, str) and run_id

        run_response = await client.get(f"/runs/{run_id}")
        assert run_response.status_code == 200
        assert run_response.json()["run_id"] == run_id

        pdf_response = await client.get(f"/runs/{run_id}/export/pdf")
        assert pdf_response.status_code == 200
        assert pdf_response.headers["content-type"] == "application/pdf"
        assert pdf_response.content

        docx_response = await client.get(f"/runs/{run_id}/export/docx")
        assert docx_response.status_code == 200
        assert docx_response.headers["content-type"].startswith(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        assert docx_response.content
