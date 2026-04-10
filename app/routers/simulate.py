import logging
from fastapi import APIRouter, HTTPException, Request

from app.models.graph import SimulationRequest, SimulationResponse
from app.security import run_guarded_simulation
from app.services.agent_service import generate_agents_from_graph
from app.services.graph_service import extract_graph
from app.services.simulation_service import run_simulation

router = APIRouter(prefix="/simulate", tags=["Simulation"])
logger = logging.getLogger(__name__)


@router.post(
    "",
    response_model=SimulationResponse,
    summary="Run multi-agent social simulation",
)
async def simulate(http_request: Request, request: SimulationRequest) -> SimulationResponse:
    try:
        async def operation() -> SimulationResponse:
            graph = await extract_graph(topic=request.topic, context=request.context)
            agents_response = await generate_agents_from_graph(
                topic=request.topic,
                graph=graph,
                agents_per_node=request.agents_per_node,
                context=request.context or "",
            )

            if not agents_response.agents:
                raise ValueError("Unable to generate agents for this simulation.")

            return await run_simulation(
                topic=request.topic,
                agents=agents_response.agents,
                rounds=request.rounds,
                agents_per_round=request.agents_per_round,
                seed=request.random_seed,
            )

        return await run_guarded_simulation(http_request, operation)
    except HTTPException:
        raise
    except ValueError:
        raise HTTPException(status_code=422, detail="Unable to simulate with the provided input.")
    except Exception:
        logger.exception("Simulation route failed")
        raise HTTPException(status_code=500, detail="Internal server error.")