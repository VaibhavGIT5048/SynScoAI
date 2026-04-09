import logging
from fastapi import APIRouter, HTTPException, Request

from app.models.graph import AnalyzeRequest, AnalyzeResponse
from app.security import run_guarded_request
from app.services.graph_service import extract_graph

router = APIRouter(prefix="/analyze", tags=["Graph"])
logger = logging.getLogger(__name__)


@router.post(
    "",
    response_model=AnalyzeResponse,
    summary="Extract social knowledge graph from a topic",
    description=(
        "Accepts a social topic (e.g. 'college fee increase') and uses an LLM to "
        "extract a graph of stakeholders, institutions, concepts, policies, and outcomes "
        "with weighted relationships between them."
    ),
)
async def analyze_topic(http_request: Request, request: AnalyzeRequest) -> AnalyzeResponse:
    try:
        async def operation() -> AnalyzeResponse:
            return await extract_graph(topic=request.topic, context=request.context)

        return await run_guarded_request(http_request, operation)
    except HTTPException:
        raise
    except ValueError:
        raise HTTPException(status_code=422, detail="Unable to analyze the provided input.")
    except RuntimeError:
        logger.exception("Analyze route runtime failure")
        raise HTTPException(status_code=500, detail="Internal server error.")
    except Exception:
        logger.exception("Analyze route failed")
        raise HTTPException(status_code=500, detail="Internal server error.")
