from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import agents, analyze, pipeline, report, runs, simulate

app = FastAPI(
    title="SynSoc AI",
    description=(
        "Social simulation engine — extract knowledge graphs, spawn agents, "
        "run multi-agent simulations, and generate insight reports."
    ),
    version="0.4.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(analyze.router)
app.include_router(agents.router)
app.include_router(simulate.router)
app.include_router(report.router)
app.include_router(pipeline.router)
app.include_router(runs.router)


@app.get("/", tags=["Health"])
async def root():
    return {
        "service": "SynSoc AI",
        "version": "0.4.0",
        "status": "running",
        "endpoints": {
            "analyze":         "POST /analyze",
            "agents":          "POST /agents",
            "simulate":        "POST /simulate",
            "pipeline_stream": "POST /pipeline/stream",
            "report":          "POST /report",
            "pipeline":        "POST /pipeline",
            "runs":            "GET /runs/{run_id}",
            "docs":            "/docs",
        },
    }


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok"}