import os

import httpx
import pytest
from fastapi import HTTPException

# Keep tests self-contained when local env vars are not exported.
os.environ.setdefault("OPENAI_API_KEY", "test-key")
os.environ.setdefault("OPENAI_MODEL", "gpt-5.4-nano")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:5173")
os.environ.setdefault("RATE_LIMIT_PER_MINUTE_IP", "1000")
os.environ.setdefault("SIM_LIMIT_PER_DAY_VISITOR", "1000")
os.environ.setdefault("MAX_CONCURRENT_SIM_PER_VISITOR", "1")
os.environ.setdefault("REQUEST_TIMEOUT_SECONDS", "5")
os.environ.setdefault("MAX_INPUT_CHARS_TOPIC", "200")
os.environ.setdefault("MAX_INPUT_CHARS_CONTEXT", "5000")
os.environ.setdefault("TRUST_PROXY_HEADERS", "false")

from app.main import app
import app.routers.runs as runs_router


@pytest.mark.asyncio
async def test_get_run_public_payload_allows_unauthenticated_access(monkeypatch: pytest.MonkeyPatch):
    async def fake_get_pipeline_run(run_id: str):
        return {"run_id": run_id, "owner_id": None, "result": {"topic": "public"}}

    monkeypatch.setattr(runs_router, "get_pipeline_run", fake_get_pipeline_run)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/runs/public-run")

    assert response.status_code == 200
    assert response.json()["run_id"] == "public-run"


@pytest.mark.asyncio
async def test_get_run_owned_payload_requires_same_user(monkeypatch: pytest.MonkeyPatch):
    async def fake_get_pipeline_run(run_id: str):
        return {"run_id": run_id, "owner_id": "user-1", "result": {"topic": "owned"}}

    async def fake_get_request_user_id(request, *, required: bool):
        assert required is True
        return "user-2"

    monkeypatch.setattr(runs_router, "get_pipeline_run", fake_get_pipeline_run)
    monkeypatch.setattr(runs_router, "get_request_user_id", fake_get_request_user_id)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/runs/owned-run")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_run_owned_payload_missing_token_returns_401(monkeypatch: pytest.MonkeyPatch):
    async def fake_get_pipeline_run(run_id: str):
        return {"run_id": run_id, "owner_id": "user-1", "result": {"topic": "owned"}}

    async def fake_get_request_user_id(request, *, required: bool):
        assert required is True
        raise HTTPException(status_code=401, detail="Missing bearer token.")

    monkeypatch.setattr(runs_router, "get_pipeline_run", fake_get_pipeline_run)
    monkeypatch.setattr(runs_router, "get_request_user_id", fake_get_request_user_id)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/runs/owned-run")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_export_pdf_owned_payload_requires_access(monkeypatch: pytest.MonkeyPatch):
    async def fake_get_pipeline_run(run_id: str):
        return {"run_id": run_id, "owner_id": "user-1", "result": {"topic": "owned"}}

    async def fake_get_request_user_id(request, *, required: bool):
        assert required is True
        return "user-1"

    def fake_build_pdf_bytes(run_payload: dict) -> bytes:
        assert run_payload["run_id"] == "owned-run"
        return b"%PDF-test"

    monkeypatch.setattr(runs_router, "get_pipeline_run", fake_get_pipeline_run)
    monkeypatch.setattr(runs_router, "get_request_user_id", fake_get_request_user_id)
    monkeypatch.setattr(runs_router, "build_pdf_bytes", fake_build_pdf_bytes)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/runs/owned-run/export/pdf")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"


@pytest.mark.asyncio
async def test_export_docx_owned_payload_requires_access(monkeypatch: pytest.MonkeyPatch):
    async def fake_get_pipeline_run(run_id: str):
        return {"run_id": run_id, "owner_id": "user-1", "result": {"topic": "owned"}}

    async def fake_get_request_user_id(request, *, required: bool):
        assert required is True
        return "user-1"

    def fake_build_docx_bytes(run_payload: dict) -> bytes:
        assert run_payload["run_id"] == "owned-run"
        return b"PK-test"

    monkeypatch.setattr(runs_router, "get_pipeline_run", fake_get_pipeline_run)
    monkeypatch.setattr(runs_router, "get_request_user_id", fake_get_request_user_id)
    monkeypatch.setattr(runs_router, "build_docx_bytes", fake_build_docx_bytes)

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/runs/owned-run/export/docx")

    assert response.status_code == 200
    assert (
        response.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
