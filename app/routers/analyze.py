from fastapi import APIRouter, HTTPException, Request

from app.models.graph import AnalyzeRequest, AnalyzeResponse
from app.security import run_guarded_request
from app.services.graph_service import extract_graph

router = APIRouter(prefix="/analyze", tags=["Graph"])


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
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Graph extraction failed: {str(e)}",
        )
