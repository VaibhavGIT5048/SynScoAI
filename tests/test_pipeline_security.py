import asyncio
import os
from types import SimpleNamespace

import httpx
import pytest
from starlette.requests import Request

# Keep tests self-contained when local env vars are not exported.
os.environ.setdefault("OPENAI_API_KEY", "test-key")
os.environ.setdefault("OPENAI_MODEL", "gpt-5.4-nano")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:5173")
os.environ.setdefault("RATE_LIMIT_PER_MINUTE_IP", "1000")
os.environ.setdefault("SIM_LIMIT_PER_DAY_VISITOR", "1000")
os.environ.setdefault("MAX_CONCURRENT_SIM_PER_VISITOR", "1")
os.environ.setdefault("REQUEST_TIMEOUT_SECONDS", "5")
os.environ.setdefault("MAX_INPUT_CHARS_TOPIC", "200")
os.environ.setdefault("MAX_INPUT_CHARS_CONTEXT", "5000")
os.environ.setdefault("TRUST_PROXY_HEADERS", "false")

from app.main import app
from app.models.graph import (
    Agent,
    AgentResponse,
    AnalyzeResponse,
    GraphNode,
    PipelineResponse,
    ReportResponse,
    SimulationResponse,
    SimulationTurn,
    StakeholderInsight,
)
import app.routers.pipeline as pipeline_router
import app.routers.simulate as simulate_router
import app.security as security
import app.services.agent_service as agent_service


def _payload() -> dict:
    return {
        "topic": "Public transit fare increase",
        "context": "Backend security test payload.",
        "rounds": 1,
        "agents_per_round": 1,
        "agents_per_node": 1,
    }


def _build_agent(index: int = 1) -> Agent:
    return Agent(
        id=f"agent-{index}",
        name=f"Agent {index}",
        type="stakeholder",
        represents="Transit Riders",
        role="Policy Analyst",
        personality="calm",
        goal="Improve transport outcomes",
        stance="neutral",
        reasoning_style="analytical",
        knowledge_domain=["transport policy"],
        skills=["analysis"],
        bias="equity-first",
        risk_tolerance="moderate",
    )


def _build_graph(topic: str) -> AnalyzeResponse:
    return AnalyzeResponse(
        topic=topic,
        nodes=[
            GraphNode(
                id="node-riders",
                label="Transit Riders",
                type="stakeholder",
                description="People impacted by fare changes.",
            )
        ],
        edges=[],
        summary="Minimal graph for endpoint tests.",
    )


def _build_turn(topic: str) -> SimulationTurn:
    return SimulationTurn(
        round=1,
        agent_id="agent-1",
        agent_name="Agent 1",
        represents="Transit Riders",
        role="Policy Analyst",
        stance="neutral",
        message=f"On {topic}, measured changes are needed.",
        emotion="calm",
        action="supports",
        challenges=[],
        reasoning_chain="fare pressure -> service quality tradeoff",
    )


def _build_simulation(topic: str, rounds: int) -> SimulationResponse:
    turn = _build_turn(topic)
    return SimulationResponse(
        topic=topic,
        total_rounds=rounds,
        total_turns=1,
        turns=[turn],
        key_tensions=["affordability vs sustainability"],
        dominant_stances={"neutral": 1},
    )


def _build_report(topic: str) -> ReportResponse:
    return ReportResponse(
        topic=topic,
        executive_summary="Short summary for tests.",
        key_findings=["Finding 1"],
        stakeholder_insights=[
            StakeholderInsight(
                represents="Transit Riders",
                summary="Riders are price-sensitive.",
                final_stance="neutral",
                influence_score=0.8,
            )
        ],
        predicted_outcome="Incremental policy adjustment",
        policy_recommendations=["Phase in fare changes"],
        conflict_score=0.3,
        consensus_areas=["Need reliability"],
        total_turns_analyzed=1,
    )


@pytest.fixture(autouse=True)
def _reset_security_state():
    security.reset_inmemory_state_for_tests()

    yield

    security.reset_inmemory_state_for_tests()


def _build_request(client_ip: str, headers: dict[str, str]) -> Request:
    scope = {
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "headers": [(k.lower().encode("latin-1"), v.encode("latin-1")) for k, v in headers.items()],
        "client": (client_ip, 12345),
        "server": ("testserver", 80),
        "scheme": "http",
    }
    return Request(scope)


def _patch_happy_path(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_extract_graph(topic: str, context: str | None = None):
        return _build_graph(topic)

    async def fake_generate_agents_from_graph(
        topic: str,
        graph,
        agents_per_node: int = 1,
        context: str = "",
    ):
        agents = [_build_agent(1)]
        return AgentResponse(topic=topic, total_agents=len(agents), agents=agents)

    async def fake_run_simulation(
        topic: str,
        agents,
        rounds: int,
        agents_per_round: int,
        seed: int | None = None,
    ):
        return _build_simulation(topic, rounds)

    async def fake_generate_report(topic: str, simulation, agents, context: str = ""):
        return _build_report(topic)

    monkeypatch.setattr(pipeline_router, "extract_graph", fake_extract_graph)
    monkeypatch.setattr(
        pipeline_router,
        "generate_agents_from_graph",
        fake_generate_agents_from_graph,
    )
    monkeypatch.setattr(pipeline_router, "run_simulation", fake_run_simulation)
    monkeypatch.setattr(pipeline_router, "generate_report", fake_generate_report)


@pytest.mark.asyncio
async def test_pipeline_returns_200_with_valid_payload(monkeypatch: pytest.MonkeyPatch):
    _patch_happy_path(monkeypatch)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/pipeline",
            json=_payload(),
            headers={"X-Visitor-Id": "pipeline-success-visitor"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["topic"] == _payload()["topic"]
    assert body["agents"]["total_agents"] == 1
    assert body["simulation"]["total_turns"] == 1


@pytest.mark.asyncio
async def test_pipeline_stream_same_visitor_concurrency_returns_200_then_429(
    monkeypatch: pytest.MonkeyPatch,
):
    gate = asyncio.Event()

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
        # Block stream progress until the second request is sent.
        await gate.wait()
        return [_build_agent(counter_start)]

    async def fake_agent_speak(agent, topic: str, recent_turns, round_num: int, model: str):
        return _build_turn(topic)

    def fake_extract_tensions(turns):
        return ["affordability vs sustainability"]

    async def fake_generate_report(topic: str, simulation, agents, context: str = ""):
        return _build_report(topic)

    monkeypatch.setattr(pipeline_router, "extract_graph", fake_extract_graph)
    monkeypatch.setattr(agent_service, "_generate_agents_for_node", fake_generate_agents_for_node)
    monkeypatch.setattr(pipeline_router, "_agent_speak", fake_agent_speak)
    monkeypatch.setattr(pipeline_router, "_extract_tensions", fake_extract_tensions)
    monkeypatch.setattr(pipeline_router, "generate_report", fake_generate_report)

    headers = {"X-Visitor-Id": "stream-concurrency-visitor"}

    async def first_request():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            return await client.post("/pipeline/stream", json=_payload(), headers=headers)

    first_task = asyncio.create_task(first_request())
    await asyncio.sleep(0.05)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        second_response = await client.post(
            "/pipeline/stream",
            json=_payload(),
            headers=headers,
        )

    gate.set()
    first_response = await first_task

    assert first_response.status_code == 200
    assert second_response.status_code == 429
    assert "Concurrent simulation limit" in second_response.json()["detail"]


@pytest.mark.asyncio
async def test_pipeline_timeout_returns_504(monkeypatch: pytest.MonkeyPatch):
    async def slow_extract_graph(topic: str, context: str | None = None):
        await asyncio.sleep(0.05)
        return _build_graph(topic)

    monkeypatch.setattr(pipeline_router, "extract_graph", slow_extract_graph)
    monkeypatch.setattr(
        security,
        "settings",
        SimpleNamespace(
            rate_limit_per_minute_ip=1000,
            sim_limit_per_day_visitor=1000,
            max_concurrent_sim_per_visitor=1,
            request_timeout_seconds=0.01,
            trust_proxy_headers=False,
        ),
    )

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/pipeline",
            json=_payload(),
            headers={"X-Visitor-Id": "pipeline-timeout-visitor"},
        )

    assert response.status_code == 504
    assert response.json()["detail"] == "Simulation request timed out."


@pytest.mark.asyncio
async def test_simulate_route_generates_agents_before_simulation(monkeypatch: pytest.MonkeyPatch):
    captured: dict[str, int] = {}

    async def fake_extract_graph(topic: str, context: str | None = None):
        return _build_graph(topic)

    async def fake_generate_agents_from_graph(
        topic: str,
        graph,
        agents_per_node: int = 1,
        context: str = "",
    ):
        agents = [_build_agent(1)]
        return AgentResponse(topic=topic, total_agents=1, agents=agents)

    async def fake_run_simulation(
        topic: str,
        agents,
        rounds: int,
        agents_per_round: int,
        seed: int | None = None,
    ):
        captured["agents_count"] = len(agents)
        return _build_simulation(topic, rounds)

    monkeypatch.setattr(simulate_router, "extract_graph", fake_extract_graph)
    monkeypatch.setattr(simulate_router, "generate_agents_from_graph", fake_generate_agents_from_graph)
    monkeypatch.setattr(simulate_router, "run_simulation", fake_run_simulation)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/simulate",
            json={
                "topic": "Public transit fare increase",
                "context": "Simulation endpoint test",
                "rounds": 1,
                "agents_per_round": 1,
                "agents_per_node": 1,
            },
            headers={"X-Visitor-Id": "simulate-route-visitor"},
        )

    assert response.status_code == 200
    assert captured["agents_count"] == 1


def test_identity_ignores_untrusted_forwarding_headers():
    request = _build_request(
        client_ip="198.51.100.44",
        headers={
            "x-forwarded-for": "203.0.113.200",
            "x-real-ip": "203.0.113.201",
            "x-visitor-id": "spoofed-visitor-id",
        },
    )

    assert security._client_ip(request) == "198.51.100.44"
    assert security._visitor_id(request) == "ip:198.51.100.44"


@pytest.mark.asyncio
async def test_pipeline_internal_error_is_sanitized(monkeypatch: pytest.MonkeyPatch):
    async def failing_extract_graph(topic: str, context: str | None = None):
        raise RuntimeError("upstream provider returned secret stacktrace")

    monkeypatch.setattr(pipeline_router, "extract_graph", failing_extract_graph)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/pipeline",
            json=_payload(),
            headers={"X-Visitor-Id": "pipeline-sanitize-visitor"},
        )

    assert response.status_code == 500
    assert response.json()["detail"] == "Internal server error."


@pytest.mark.asyncio
async def test_pipeline_stream_error_is_sanitized(monkeypatch: pytest.MonkeyPatch):
    async def failing_extract_graph(topic: str, context: str | None = None):
        raise RuntimeError("streaming secret provider failure")

    monkeypatch.setattr(pipeline_router, "extract_graph", failing_extract_graph)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/pipeline/stream",
            json=_payload(),
            headers={"X-Visitor-Id": "pipeline-stream-sanitize-visitor"},
        )

    body_text = response.text
    assert response.status_code == 200
    assert "An internal error occurred." in body_text
    assert "streaming secret provider failure" not in body_text


@pytest.mark.asyncio
async def test_shared_store_reservation_semantics_across_worker_facades():
    # Two worker facades sharing one backing store should enforce shared concurrency limits.
    shared_store = security.InMemoryStateStore()
    visitor = "ip:203.0.113.10"
    day_key = f"{security._utc_day()}:{visitor}"

    first_ok, first_reason = await shared_store.reserve_slot(visitor, day_key, daily_limit=5, concurrent_limit=1)
    second_ok, second_reason = await shared_store.reserve_slot(visitor, day_key, daily_limit=5, concurrent_limit=1)

    assert first_ok is True
    assert first_reason is None
    assert second_ok is False
    assert second_reason == "concurrent"

    await shared_store.release_slot(visitor)

    third_ok, third_reason = await shared_store.reserve_slot(visitor, day_key, daily_limit=5, concurrent_limit=1)
    assert third_ok is True
    assert third_reason is None