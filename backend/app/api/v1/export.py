"""Excel export endpoint."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db_session
from app.core.exceptions import JobNotFoundError
from app.core.middleware import require_tenant
from app.models.schemas import AuditLogEntry, ReconciliationReport
from app.repositories.job_repository import JobRepository
from app.services.excel_export import render_excel_report
from app.services.report_hydration import hydrate_report

router = APIRouter()


@router.get("/{job_id}/export")
async def export_excel(
    job_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> StreamingResponse:
    repo = JobRepository(session, tenant_id=tenant_id)
    try:
        job = await repo.get(job_id)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if not job.report_blob:
        raise HTTPException(status_code=409, detail="Report not yet available")

    report = await hydrate_report(repo, job)
    audit_rows = await repo.list_audit(job_id)
    audit_entries = [
        AuditLogEntry(
            id=UUID(row.id),
            job_id=UUID(row.job_id),
            agent=row.agent,
            action=row.action,
            input_snapshot=row.input_snapshot,
            output_snapshot=row.output_snapshot,
            reasoning=row.reasoning,
            confidence=row.confidence,
            timestamp=row.timestamp,
        )
        for row in audit_rows
    ]

    data = render_excel_report(report, audit_entries)
    headers = {
        "Content-Disposition": f"attachment; filename=aria_reconciliation_{job_id}.xlsx"
    }
    return StreamingResponse(
        iter([data]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )
