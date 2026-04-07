import json
import traceback
from collections import Counter
from typing import List

from dotenv import load_dotenv

from app.models.graph import Agent, ReportResponse, SimulationResponse, StakeholderInsight
from app.prompts.report_prompts import REPORT_SYSTEM, REPORT_USER
from app.services.llm_client import chat

load_dotenv()


def _build_transcript(simulation: SimulationResponse) -> str:
    lines = []
    current_round = 0
    for turn in simulation.turns:
        if turn.round != current_round:
            current_round = turn.round
            lines.append(f"\n--- Round {current_round} ---")
        lines.append(
            f"[{turn.agent_name} | {turn.represents} | {turn.stance} | {turn.emotion}]: "
            f"{turn.message}"
        )
    return "\n".join(lines)


def _build_metrics_snapshot(simulation: SimulationResponse, agents: List[Agent]) -> dict:
    stance_counts = Counter(turn.stance for turn in simulation.turns)
    action_counts = Counter(turn.action for turn in simulation.turns)
    turns_per_round = Counter(turn.round for turn in simulation.turns)
    turns_by_agent = Counter(turn.agent_name for turn in simulation.turns)

    top_speakers = [
        {"agent": name, "turns": count}
        for name, count in turns_by_agent.most_common(5)
    ]

    evidence_snippets = [
        f"R{turn.round} {turn.agent_name}: {turn.message.strip()[:120]}"
        for turn in simulation.turns[:8]
        if turn.message.strip()
    ]

    return {
        "total_agents": len(agents),
        "stance_counts": dict(stance_counts),
        "action_counts": dict(action_counts),
        "top_speakers": top_speakers,
        "turns_per_round": dict(turns_per_round),
        "evidence_snippets": evidence_snippets,
    }


async def generate_report(
    topic: str,
    simulation: SimulationResponse,
    agents: List[Agent],
    context: str = "",
) -> ReportResponse:

    transcript = _build_transcript(simulation)
    metrics = _build_metrics_snapshot(simulation, agents)
    context_block = f"Context: {context}" if context else ""

    user_message = REPORT_USER.format(
        topic=topic,
        context_block=context_block,
        total_turns=simulation.total_turns,
        total_rounds=simulation.total_rounds,
        transcript=transcript,
        key_tensions=", ".join(simulation.key_tensions),
        dominant_stances=json.dumps(simulation.dominant_stances, ensure_ascii=False),
        total_agents=metrics["total_agents"],
        stance_counts=json.dumps(metrics["stance_counts"], ensure_ascii=False),
        action_counts=json.dumps(metrics["action_counts"], ensure_ascii=False),
        top_speakers=json.dumps(metrics["top_speakers"], ensure_ascii=False),
        turns_per_round=json.dumps(metrics["turns_per_round"], ensure_ascii=False),
        evidence_snippets=json.dumps(metrics["evidence_snippets"], ensure_ascii=False),
    )

    print("🔄 Generating report...")

    try:
        raw = await chat(
            messages=[
                {"role": "system", "content": REPORT_SYSTEM},
                {"role": "user", "content": user_message},
            ],
            temperature=0.3,
        )

        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        data = json.loads(raw)

        stakeholder_insights = [
            StakeholderInsight(**s) for s in data.get("stakeholder_insights", [])
        ]

        print("✅ Report generated")

        return ReportResponse(
            topic=topic,
            executive_summary=data.get("executive_summary", ""),
            key_findings=data.get("key_findings", []),
            stakeholder_insights=stakeholder_insights,
            predicted_outcome=data.get("predicted_outcome", ""),
            policy_recommendations=data.get("policy_recommendations", []),
            conflict_score=float(data.get("conflict_score", 0.5)),
            consensus_areas=data.get("consensus_areas", []),
            total_turns_analyzed=simulation.total_turns,
        )

    except Exception:
        print("REPORT ERROR:", traceback.format_exc())
        raise