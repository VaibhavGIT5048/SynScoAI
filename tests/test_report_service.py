import json
import os

import pytest

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

from app.models.graph import Agent, SimulationResponse, SimulationTurn
import app.services.report_service as report_service


def _agent(index: int, stance: str = "neutral") -> Agent:
    return Agent(
        id=f"agent-{index}",
        name=f"Agent {index}",
        type="stakeholder",
        represents=f"Stakeholder {index}",
        role="Policy Analyst",
        personality="calm",
        goal="Improve outcomes",
        stance=stance,
        reasoning_style="analytical",
        knowledge_domain=["policy"],
        skills=["analysis"],
        bias="neutral",
        risk_tolerance="moderate",
    )


def _turn(round_num: int, stance: str, agent_name: str) -> SimulationTurn:
    return SimulationTurn(
        round=round_num,
        agent_id=agent_name.lower().replace(" ", "-"),
        agent_name=agent_name,
        represents="Public",
        stance=stance,
        message="Measured safeguards are needed.",
        emotion="calm",
        action="supports",
    )


def _simulation(turns: list[SimulationTurn]) -> SimulationResponse:
    return SimulationResponse(
        topic="Test Topic",
        total_rounds=2,
        total_turns=len(turns),
        turns=turns,
        key_tensions=["speed vs safeguards"],
        dominant_stances={"for": 1, "against": 1},
    )


def test_compute_conflict_score_is_deterministic():
    simulation = _simulation(
        [
            _turn(1, "strongly_for", "Agent 1"),
            _turn(1, "strongly_against", "Agent 2"),
            _turn(2, "for", "Agent 3"),
            _turn(2, "against", "Agent 4"),
        ]
    )

    first = report_service._compute_conflict_score(simulation)
    second = report_service._compute_conflict_score(simulation)

    assert first == second
    assert 0 <= first <= 1
    assert first > 0.5


@pytest.mark.asyncio
async def test_generate_report_uses_backend_conflict_score(monkeypatch: pytest.MonkeyPatch):
    simulation = _simulation(
        [
            _turn(1, "strongly_for", "Agent 1"),
            _turn(1, "strongly_against", "Agent 2"),
            _turn(2, "strongly_for", "Agent 3"),
            _turn(2, "strongly_against", "Agent 4"),
        ]
    )

    async def fake_chat(messages, temperature, model):
        _ = (messages, temperature, model)
        return json.dumps(
            {
                "executive_summary": "Debate had high disagreement and split preferences.",
                "key_findings": [
                    "2 agents supported strict rollout. Proof: Round 1, Agent 1 said 'start now'.",
                    "2 agents supported strict rollout. Proof: Round 1, Agent 1 said 'start now'.",
                ],
                "stakeholder_insights": [
                    {
                        "represents": "Public",
                        "summary": "Public is split with 50-50 stance. Proof: Round 2, Agent 2 said 'wait'.",
                        "final_stance": "neutral",
                        "influence_score": 0.9,
                    },
                    {
                        "represents": "Public",
                        "summary": "Duplicate entry should be removed.",
                        "final_stance": "neutral",
                        "influence_score": 0.2,
                    },
                ],
                "predicted_outcome": "Final verdict: phased rollout with legal safeguards.",
                "policy_recommendations": [
                    "Start with safeguards and review checkpoints.",
                    "Start with safeguards and review checkpoints.",
                ],
                "conflict_score": 0.01,
                "consensus_areas": [
                    "Need safeguards before full rollout.",
                    "Need safeguards before full rollout.",
                ],
            }
        )

    monkeypatch.setattr(report_service, "chat", fake_chat)

    result = await report_service.generate_report(
        topic="Test Topic",
        simulation=simulation,
        agents=[_agent(1), _agent(2), _agent(3), _agent(4)],
        context="",
    )

    expected = report_service._compute_conflict_score(simulation)

    assert result.conflict_score == expected
    assert result.conflict_score != 0.01
    assert len(result.policy_recommendations) == 1
    assert len(result.consensus_areas) == 1
    assert len(result.stakeholder_insights) == 1
