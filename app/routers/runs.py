from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from app.services.auth_service import get_request_user_id
from app.services.export_service import build_docx_bytes, build_pdf_bytes
from app.services.run_store import get_pipeline_run

router = APIRouter(prefix="/runs", tags=["Runs"])


def _enforce_run_access(run_payload: dict, request: Request) -> None:
    owner_id = run_payload.get("owner_id")
    if not owner_id:
        return

    request_user_id = get_request_user_id(request, required=True)
    if request_user_id != owner_id:
        raise HTTPException(status_code=404, detail="Run not found or expired.")


@router.get("/{run_id}")
async def get_run(run_id: str, request: Request):
    run_payload = await get_pipeline_run(run_id)
    if not run_payload:
        raise HTTPException(status_code=404, detail="Run not found or expired.")
    _enforce_run_access(run_payload, request)
    return run_payload


@router.get("/{run_id}/export/pdf")
async def export_run_pdf(run_id: str, request: Request):
    run_payload = await get_pipeline_run(run_id)
    if not run_payload:
        raise HTTPException(status_code=404, detail="Run not found or expired.")
    _enforce_run_access(run_payload, request)

    pdf_bytes = build_pdf_bytes(run_payload)
    filename = f"synsoc-run-{run_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{run_id}/export/docx")
async def export_run_docx(run_id: str, request: Request):
    run_payload = await get_pipeline_run(run_id)
    if not run_payload:
        raise HTTPException(status_code=404, detail="Run not found or expired.")
    _enforce_run_access(run_payload, request)

    docx_bytes = build_docx_bytes(run_payload)
    filename = f"synsoc-run-{run_id}.docx"
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
