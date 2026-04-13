import json
import traceback
from collections import Counter
from typing import Iterable, List

from dotenv import load_dotenv

from app.config import settings
from app.models.graph import Agent, ReportResponse, SimulationResponse, StakeholderInsight
from app.prompts.report_prompts import REPORT_SYSTEM, REPORT_USER
from app.services.llm_client import chat

load_dotenv()


STANCE_WEIGHTS = {
    "strongly_for": 1.0,
    "for": 0.5,
    "neutral": 0.0,
    "against": -0.5,
    "strongly_against": -1.0,
}


def _normalize_text(value: str) -> str:
    return " ".join(value.split())


def _as_text_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def _unique_text_list(items: Iterable[str], limit: int | None = None) -> list[str]:
    unique_items: list[str] = []
    seen: set[str] = set()

    for item in items:
        normalized = _normalize_text(item)
        if not normalized:
            continue

        key = normalized.casefold()
        if key in seen:
            continue

        seen.add(key)
        unique_items.append(normalized)

        if limit is not None and len(unique_items) >= limit:
            break

    return unique_items


def _compute_conflict_score(simulation: SimulationResponse) -> float:
    if not simulation.turns:
        return 0.0

    scores = [STANCE_WEIGHTS.get(turn.stance, 0.0) for turn in simulation.turns]
    mean = sum(scores) / len(scores)
    variance = sum((score - mean) ** 2 for score in scores) / len(scores)
    return round(min(1.0, max(0.0, variance**0.5)), 4)


def _clean_stakeholder_insights(raw_items: object) -> list[StakeholderInsight]:
    if not isinstance(raw_items, list):
        return []

    clean_insights: list[StakeholderInsight] = []
    seen_represents: set[str] = set()

    for raw_item in raw_items:
        if not isinstance(raw_item, dict):
            continue

        represents = _normalize_text(str(raw_item.get("represents", "")))
        if not represents:
            continue

        represents_key = represents.casefold()
        if represents_key in seen_represents:
            continue

        summary = _normalize_text(str(raw_item.get("summary", "")))
        if not summary:
            summary = "No clear position was expressed in the simulation."

        final_stance = _normalize_text(str(raw_item.get("final_stance", "neutral")))
        if not final_stance:
            final_stance = "neutral"

        try:
            influence_score = float(raw_item.get("influence_score", 0.0))
        except (TypeError, ValueError):
            influence_score = 0.0

        influence_score = min(1.0, max(0.0, influence_score))

        clean_insights.append(
            StakeholderInsight(
                represents=represents,
                summary=summary,
                final_stance=final_stance,
                influence_score=influence_score,
            )
        )
        seen_represents.add(represents_key)

    return clean_insights


def _fallback_predicted_outcome(topic: str, conflict_score: float) -> str:
    if conflict_score < 0.3:
        return (
            f"Final verdict: {topic} can likely be implemented in real life with normal safeguards. "
            "The debate showed broad alignment and low resistance. "
            "Use a phased rollout with quarterly review and public transparency checks."
        )

    if conflict_score < 0.6:
        return (
            f"Final verdict: {topic} is implementable with conditions. "
            "The simulation showed mixed views that can converge with clear safeguards. "
            "Start with low-backlash administrative steps, add legal review, then expand in phases."
        )

    return (
        f"Final verdict: {topic} is not ready for full immediate implementation. "
        "The simulation showed strong conflict and unresolved concerns. "
        "Run a phased pilot first, enforce safeguards, and re-evaluate after measurable outcomes improve."
    )


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
            model=settings.openai_model_report,
        )

        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        data = json.loads(raw)

        conflict_score = _compute_conflict_score(simulation)

        executive_summary = _normalize_text(str(data.get("executive_summary", "")))
        if not executive_summary:
            executive_summary = (
                "The simulation ended with mixed views and measurable disagreement. "
                "Most agents supported a phased path with safeguards instead of immediate full rollout."
            )

        key_findings = _unique_text_list(_as_text_list(data.get("key_findings")), limit=6)
        policy_recommendations = _unique_text_list(
            _as_text_list(data.get("policy_recommendations")), limit=8
        )
        consensus_areas = _unique_text_list(_as_text_list(data.get("consensus_areas")), limit=8)

        stakeholder_insights = _clean_stakeholder_insights(
            data.get("stakeholder_insights", [])
        )

        predicted_outcome = _normalize_text(str(data.get("predicted_outcome", "")))
        if not predicted_outcome:
            predicted_outcome = _fallback_predicted_outcome(topic, conflict_score)

        print("✅ Report generated")

        return ReportResponse(
            topic=topic,
            executive_summary=executive_summary,
            key_findings=key_findings,
            stakeholder_insights=stakeholder_insights,
            predicted_outcome=predicted_outcome,
            policy_recommendations=policy_recommendations,
            conflict_score=conflict_score,
            consensus_areas=consensus_areas,
            total_turns_analyzed=simulation.total_turns,
        )

    except Exception:
        print("REPORT ERROR:", traceback.format_exc())
        raise