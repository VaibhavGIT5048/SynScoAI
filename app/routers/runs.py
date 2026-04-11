from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.services.export_service import build_docx_bytes, build_pdf_bytes
from app.services.run_store import get_pipeline_run

router = APIRouter(prefix="/runs", tags=["Runs"])


@router.get("/{run_id}")
async def get_run(run_id: str):
    run_payload = await get_pipeline_run(run_id)
    if not run_payload:
        raise HTTPException(status_code=404, detail="Run not found or expired.")
    return run_payload


@router.get("/{run_id}/export/pdf")
async def export_run_pdf(run_id: str):
    run_payload = await get_pipeline_run(run_id)
    if not run_payload:
        raise HTTPException(status_code=404, detail="Run not found or expired.")

    pdf_bytes = build_pdf_bytes(run_payload)
    filename = f"synsoc-run-{run_id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{run_id}/export/docx")
async def export_run_docx(run_id: str):
    run_payload = await get_pipeline_run(run_id)
    if not run_payload:
        raise HTTPException(status_code=404, detail="Run not found or expired.")

    docx_bytes = build_docx_bytes(run_payload)
    filename = f"synsoc-run-{run_id}.docx"
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
