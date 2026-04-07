from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from app.models.graph import ReportResponse, validate_context_text, validate_topic_text
from app.security import run_guarded_simulation
from app.services.report_service import generate_report
from app.services.simulation_service import run_simulation
from app.services.agent_service import generate_agents_from_graph
from app.services.graph_service import extract_graph


class ReportRequest(BaseModel):
    topic: str = Field(..., min_length=3)
    context: Optional[str] = None
    rounds: int = Field(default=2, ge=1, le=10)
    agents_per_round: int = Field(default=3, ge=1, le=10)

    @field_validator("topic")
    @classmethod
    def validate_topic(cls, value: str) -> str:
        return validate_topic_text(value)

    @field_validator("context")
    @classmethod
    def validate_context(cls, value: Optional[str]) -> Optional[str]:
        return validate_context_text(value)


router = APIRouter(prefix="/report", tags=["Report"])


@router.post("", response_model=ReportResponse)
async def report(http_request: Request, request: ReportRequest) -> ReportResponse:
    try:
        async def operation() -> ReportResponse:
            print("🔄 Running simulation for report...")

            graph = await extract_graph(topic=request.topic, context=request.context)

            agents_response = await generate_agents_from_graph(
                topic=request.topic,
                graph=graph,
                agents_per_node=3,
                context=request.context or "",
            )

            simulation = await run_simulation(
                topic=request.topic,
                agents=agents_response.agents,
                rounds=request.rounds,
                agents_per_round=request.agents_per_round,
            )
            print(f"✅ Simulation complete — {simulation.total_turns} turns")

            return await generate_report(
                topic=request.topic,
                simulation=simulation,
                agents=agents_response.agents,
                context=request.context or "",
            )

        return await run_guarded_simulation(http_request, operation)

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation failed: {str(e)}")