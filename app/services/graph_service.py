import json
import traceback

from dotenv import load_dotenv

from app.models.graph import AnalyzeResponse, GraphEdge, GraphNode
from app.prompts.graph_prompts import GRAPH_EXTRACTION_SYSTEM, GRAPH_EXTRACTION_USER
from app.services.llm_client import chat

load_dotenv()


async def extract_graph(topic: str, context: str | None = None) -> AnalyzeResponse:
    context_block = f"\nAdditional context: {context}" if context else ""
    user_message = GRAPH_EXTRACTION_USER.format(
        topic=topic,
        context_block=context_block,
    )

    try:
        raw = await chat(
            messages=[
                {"role": "system", "content": GRAPH_EXTRACTION_SYSTEM},
                {"role": "user", "content": user_message},
            ],
            temperature=0.2,
        )

        data = json.loads(raw)
        nodes = [GraphNode(**n) for n in data["nodes"]]
        edges = [GraphEdge(**e) for e in data["edges"]]
        summary = data.get("summary", "")

        return AnalyzeResponse(
            topic=topic,
            nodes=nodes,
            edges=edges,
            summary=summary,
        )

    except Exception:
        print("GRAPH ERROR:", traceback.format_exc())
        raise