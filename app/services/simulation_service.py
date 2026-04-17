import json
import random
import traceback
from collections import Counter
from typing import List

from dotenv import load_dotenv

from app.config import settings
from app.models.graph import Agent, SimulationResponse, SimulationTurn
from app.prompts.simulation_prompts import SIMULATION_SYSTEM, SIMULATION_USER
from app.services.llm_client import chat

load_dotenv()

MEMORY_WINDOW = 2


def _build_memory_block(turns: List[SimulationTurn]) -> str:
    if not turns:
        return "No messages yet — you are the first to speak."
    recent = turns[-MEMORY_WINDOW:]
    lines = []
    for t in recent:
        lines.append(f"[{t.agent_name} ({t.represents}) — {t.stance}]: {t.message}")
    return "\n".join(lines)


async def _agent_speak(
    agent: Agent,
    topic: str,
    recent_turns: List[SimulationTurn],
    round_num: int,
    model: str,
) -> SimulationTurn | None:

    memory_block = _build_memory_block(recent_turns)

    user_message = SIMULATION_USER.format(
        topic=topic,
        name=agent.name,
        role=getattr(agent, 'role', 'Policy Analyst'),
        represents=agent.represents,
        goal=agent.goal,
        stance=agent.stance,
        reasoning_style=getattr(agent, 'reasoning_style', 'analytical'),
        knowledge_domain=", ".join(getattr(agent, 'knowledge_domain', [])),
        memory_count=min(MEMORY_WINDOW, len(recent_turns)),
        memory_block=memory_block,
    )

    try:
        raw = await chat(
            messages=[
                {"role": "system", "content": SIMULATION_SYSTEM},
                {"role": "user", "content": user_message},
            ],
            temperature=0.85,
            model=model,
        )

        data = json.loads(raw)

        turn = SimulationTurn(
            round=round_num,
            agent_id=agent.id,
            agent_name=agent.name,
            represents=agent.represents,
            stance=agent.stance,
            message=data.get("message", "..."),
            emotion=data.get("emotion", "calm"),
            action=data.get("action", "argues"),
        )

        agent.memory.append(f"[Round {round_num}] {agent.name}: {turn.message}")
        if len(agent.memory) > MEMORY_WINDOW:
            agent.memory = agent.memory[-MEMORY_WINDOW:]

        print(f"  💬 [{round_num}] {agent.name} ({agent.represents}): {turn.emotion} / {turn.action}")
        return turn

    except Exception:
        print(f"  ❌ Failed for agent {agent.name}:\n{traceback.format_exc()}")
        return None


async def run_simulation(
    topic: str,
    agents: List[Agent],
    rounds: int = 2,
    agents_per_round: int = 3,
    seed: int | None = None,
) -> SimulationResponse:

    if not agents:
        raise ValueError("No agents available for simulation")

    all_turns: List[SimulationTurn] = []
    ordered_agents = sorted(agents, key=lambda agent: agent.id)
    # Keep debate behavior predictable across clients.
    speaker_window = min(2, len(ordered_agents))
    seed_offset = 0
    if seed is not None and len(ordered_agents) > 0:
        seed_offset = random.Random(seed).randrange(len(ordered_agents))

    for round_num in range(1, rounds + 1):
        print(f"\n🔄 Round {round_num}/{rounds}")

        start_index = (seed_offset + (round_num - 1) * speaker_window) % len(ordered_agents)
        speaking_agents = [
            ordered_agents[(start_index + i) % len(ordered_agents)]
            for i in range(speaker_window)
        ]

        for agent in speaking_agents:
            turn = await _agent_speak(
                agent=agent,
                topic=topic,
                recent_turns=all_turns,
                round_num=round_num,
                model=settings.openai_model_simulation,
            )
            if turn:
                all_turns.append(turn)

    stance_counts = Counter(t.stance for t in all_turns)
    key_tensions = _extract_tensions(all_turns)

    print(f"\n✅ Simulation complete — {len(all_turns)} total turns")

    return SimulationResponse(
        topic=topic,
        total_rounds=rounds,
        total_turns=len(all_turns),
        turns=all_turns,
        key_tensions=key_tensions,
        dominant_stances=dict(stance_counts),
    )


def _extract_tensions(turns: List[SimulationTurn]) -> List[str]:
    tensions = []
    stance_map: dict[str, list[str]] = {}
    for t in turns:
        if t.represents not in stance_map:
            stance_map[t.represents] = []
        if t.stance not in stance_map[t.represents]:
            stance_map[t.represents].append(t.stance)

    for_groups = [r for r, s in stance_map.items() if any(x in s for x in ["for", "strongly_for"])]
    against_groups = [r for r, s in stance_map.items() if any(x in s for x in ["against", "strongly_against"])]

    if for_groups and against_groups:
        tensions.append(f"{for_groups[0]} vs {against_groups[0]} — direct opposition on the topic")

    challengers = [t.represents for t in turns if t.action in ["challenges", "refutes"]]
    if challengers:
        tensions.append(f"{challengers[0]} actively challenged other agents' positions")

    angry_agents = [t.agent_name for t in turns if t.emotion in ["angry", "frustrated"]]
    if angry_agents:
        tensions.append(f"High emotional tension from: {', '.join(set(angry_agents[:3]))}")

    if not tensions:
        tensions.append("General disagreement on policy direction")

    return tensions