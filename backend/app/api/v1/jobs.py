"""Job submission, status, and results endpoints."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db_session
from app.core.exceptions import JobNotFoundError
from app.core.logging import bind_job_id, get_logger
from app.models.enums import JobStatus, MatchStatus
from app.models.schemas import (
    JobCreateResponse,
    JobStatusResponse,
    MatchResult,
    ReconciliationReport,
)
from app.repositories.job_repository import JobRepository
from app.services.storage import StorageService
from app.workers.tasks import enqueue_job

router = APIRouter()
logger = get_logger(__name__)

_ACCEPTED_PROOF_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "application/csv",
}


@router.post("", response_model=JobCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_job(
    payment_proofs: Annotated[list[UploadFile], File(description="Payment proofs (multi-file)")],
    bank_statement: Annotated[UploadFile, File(description="Bank statement (XLSX or CSV)")],
    base_currency: Annotated[str, Form()] = "MYR",
    session: AsyncSession = Depends(get_db_session),
) -> JobCreateResponse:
    if not payment_proofs:
        raise HTTPException(status_code=400, detail="At least one payment proof is required")
    if bank_statement is None:
        raise HTTPException(status_code=400, detail="A bank statement is required")

    storage = StorageService()
    storage.ensure_bucket()

    proof_keys: list[str] = []
    for f in payment_proofs:
        body = await f.read()
        key = storage.put_object(body, f.filename or "proof", content_type=f.content_type)
        proof_keys.append(key)

    stmt_body = await bank_statement.read()
    stmt_key = storage.put_object(
        stmt_body, bank_statement.filename or "statement", content_type=bank_statement.content_type
    )

    repo = JobRepository(session)
    job = await repo.create_job(
        base_currency=base_currency.upper(),
        payment_proof_keys=proof_keys,
        bank_statement_key=stmt_key,
    )

    bind_job_id(job.id)
    await enqueue_job(job.id)
    logger.info("job.created", proofs=len(proof_keys))

    return JobCreateResponse(
        job_id=UUID(job.id), status=JobStatus(job.status), created_at=job.created_at
    )


@router.get("/{job_id}", response_model=JobStatusResponse)
async def get_job(
    job_id: UUID, session: AsyncSession = Depends(get_db_session)
) -> JobStatusResponse:
    repo = JobRepository(session)
    try:
        job = await repo.get(job_id)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    return JobStatusResponse(
        job_id=UUID(job.id),
        status=JobStatus(job.status),
        progress_pct=job.progress_pct,
        agents_completed=list(job.agents_completed or []),
        error=job.error,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.get("/{job_id}/results", response_model=ReconciliationReport)
async def get_results(
    job_id: UUID, session: AsyncSession = Depends(get_db_session)
) -> ReconciliationReport:
    repo = JobRepository(session)
    try:
        job = await repo.get(job_id)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if not job.report_blob:
        raise HTTPException(status_code=409, detail=f"Job is {job.status}; report not yet available")

    return ReconciliationReport.model_validate(job.report_blob)


@router.get("/{job_id}/review", response_model=list[MatchResult])
async def get_review_queue(
    job_id: UUID, session: AsyncSession = Depends(get_db_session)
) -> list[MatchResult]:
    repo = JobRepository(session)
    try:
        await repo.get(job_id)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    matches = await repo.list_matches(job_id, status=MatchStatus.UNCERTAIN)
    return [MatchResult.model_validate(m.payload) for m in matches]
