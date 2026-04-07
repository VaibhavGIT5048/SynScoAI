from fastapi import APIRouter, HTTPException, Request

from app.models.graph import SimulationRequest, SimulationResponse
from app.security import run_guarded_simulation
from app.services.simulation_service import run_simulation

router = APIRouter(prefix="/simulate", tags=["Simulation"])


@router.post(
    "",
    response_model=SimulationResponse,
    summary="Run multi-agent social simulation",
)
async def simulate(http_request: Request, request: SimulationRequest) -> SimulationResponse:
    try:
        async def operation() -> SimulationResponse:
            return await run_simulation(
                topic=request.topic,
                agents=[],
                rounds=request.rounds,
                agents_per_round=request.agents_per_round,
            )

        return await run_guarded_simulation(http_request, operation)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Simulation failed: {str(e)}")