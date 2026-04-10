import json
import traceback
import asyncio
from typing import List

from dotenv import load_dotenv

from app.config import settings
from app.models.graph import Agent, AgentResponse, AnalyzeResponse
from app.prompts.agent_prompts import AGENT_GENERATION_SYSTEM, AGENT_GENERATION_USER
from app.services.llm_client import chat

load_dotenv()


def _get_node_relationships(node_id: str, graph: AnalyzeResponse) -> List[str]:
    related = []
    for edge in graph.edges:
        if edge.source == node_id:
            related.append(edge.target)
        elif edge.target == node_id:
            related.append(edge.source)
    return list(set(related))


def _clean_relationships(relationships) -> List[str]:
    """Ensure relationships is always a list of strings."""
    cleaned = []
    for r in relationships:
        if isinstance(r, str):
            cleaned.append(r)
        elif isinstance(r, dict):
            cleaned.append(r.get("id") or r.get("name") or str(r))
        else:
            cleaned.append(str(r))
    return cleaned


async def _generate_agents_for_node(
    node,
    topic: str,
    context: str,
    graph: AnalyzeResponse,
    agents_per_node: int,
    counter_start: int,
) -> List[Agent]:
    relationships = _get_node_relationships(node.id, graph)

    user_message = AGENT_GENERATION_USER.format(
        node_id=node.id,
        node_label=node.label,
        node_type=node.type,
        node_description=node.description,
        topic=topic,
        context=context or "No additional context",
        relationships=", ".join(relationships) if relationships else "none",
        num_agents=agents_per_node,
    )

    try:
        raw = await chat(
            messages=[
                {"role": "system", "content": AGENT_GENERATION_SYSTEM},
                {"role": "user", "content": user_message},
            ],
            temperature=0.7,
            model=settings.openai_model_agents,
        )

        data = json.loads(raw)
        agents = []
        for i, agent_data in enumerate(data["agents"]):
            agent_data["id"] = f"agent_{counter_start + i:03d}"
            agent_data.setdefault("role", "Policy Analyst")
            agent_data.setdefault("reasoning_style", "analytical")
            agent_data.setdefault("knowledge_domain", [])
            agent_data.setdefault("skills", [])
            agent_data.setdefault("bias", "neutral")
            agent_data.setdefault("confidence", 0.7)
            agent_data.setdefault("risk_tolerance", "moderate")
            agent_data.setdefault("assumptions", [])
            agent_data.setdefault("concerns", [])
            agent_data.setdefault("memory", [])

            # Fix relationships — always list of strings
            raw_rels = agent_data.get("relationships", relationships)
            agent_data["relationships"] = _clean_relationships(raw_rels)

            agents.append(Agent(**agent_data))

        print(f"✅ {node.id} → {len(agents)} agents")
        return agents

    except Exception:
        print(f"❌ Failed for node {node.id}: {traceback.format_exc()}")
        return []


async def generate_agents_from_graph(
    topic: str,
    graph: AnalyzeResponse,
    agents_per_node: int = 3,
    context: str = "",
) -> AgentResponse:

    tasks = [
        _generate_agents_for_node(
            node=node,
            topic=topic,
            context=context,
            graph=graph,
            agents_per_node=agents_per_node,
            counter_start=i * agents_per_node + 1,
        )
        for i, node in enumerate(graph.nodes)
    ]
    results = await asyncio.gather(*tasks)

    all_agents = [agent for node_agents in results for agent in node_agents]

    return AgentResponse(
        topic=topic,
        total_agents=len(all_agents),
        agents=all_agents,
    )