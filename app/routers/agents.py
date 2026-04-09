import logging
from fastapi import APIRouter, HTTPException, Request

from app.models.graph import AgentRequest, AgentResponse
from app.security import run_guarded_request
from app.services.agent_service import generate_agents_from_graph
from app.services.graph_service import extract_graph

router = APIRouter(prefix="/agents", tags=["Agents"])
logger = logging.getLogger(__name__)


@router.post("", response_model=AgentResponse)
async def generate_agents(http_request: Request, request: AgentRequest) -> AgentResponse:
    try:
        async def operation() -> AgentResponse:
            graph = await extract_graph(topic=request.topic, context=request.context)
            return await generate_agents_from_graph(
                topic=request.topic,
                graph=graph,
                context=request.context or "",
            )

        return await run_guarded_request(http_request, operation)

    except HTTPException:
        raise
    except RuntimeError:
        logger.exception("Agents route runtime failure")
        raise HTTPException(status_code=500, detail="Internal server error.")
    except Exception:
        logger.exception("Agents route failed")
        raise HTTPException(status_code=500, detail="Internal server error.")