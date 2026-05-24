"""Job submission, status, and results endpoints."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db_session
from app.core.exceptions import JobNotFoundError
from app.core.logging import bind_job_id, get_logger
from app.core.middleware import require_tenant
from app.models.enums import JobStatus, MatchStatus, SourceFormat
from app.models.schemas import (
    JobCreateResponse,
    JobListItem,
    JobListResponse,
    JobStatusResponse,
    MatchResult,
    ReconciliationReport,
)
from app.repositories.bank_ledger_repository import BankLedgerRepository
from app.repositories.job_repository import JobRepository
from app.services.report_hydration import hydrate_report
from app.services.storage import StorageService
from app.tools.file_parsers import detect_source_format
from app.workers.tasks import enqueue_job

router = APIRouter()
logger = get_logger(__name__)


def _validate_currency(code: str) -> str:
    """Reject clearly invalid currency codes early. Accepts any 3-letter alpha string."""
    upper = code.strip().upper()
    if not upper.isalpha() or len(upper) != 3:
        raise HTTPException(
            status_code=422,
            detail=f"base_currency must be a 3-letter ISO 4217 code (e.g. MYR), got: {code!r}",
        )
    return upper

_ACCEPTED_PROOF_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv",
    "application/csv",
}


@router.get("", response_model=JobListResponse)
async def list_jobs(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    status_filter: JobStatus | None = Query(default=None, alias="status"),
) -> JobListResponse:
    repo = JobRepository(session, tenant_id=tenant_id)
    jobs, total = await repo.list_jobs(status=status_filter, page=page, page_size=page_size)

    items = []
    for job in jobs:
        matches = job.matches or []
        matched = sum(1 for m in matches if m.status == MatchStatus.MATCHED)
        uncertain = sum(1 for m in matches if m.status == MatchStatus.UNCERTAIN)
        unmatched = sum(1 for m in matches if m.status == MatchStatus.UNMATCHED)
        items.append(JobListItem(
            job_id=UUID(job.id),
            status=JobStatus(job.status),
            progress_pct=job.progress_pct,
            base_currency=job.base_currency,
            record_count=len(matches),
            matched_count=matched,
            uncertain_count=uncertain,
            unmatched_count=unmatched,
            created_at=job.created_at,
            updated_at=job.updated_at,
        ))
    return JobListResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=JobCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_job(
    request: Request,
    payment_proofs: Annotated[list[UploadFile], File(description="Payment proofs (multi-file)")],
    bank_statement: Annotated[
        UploadFile | None,
        File(description="Bank statement file (XLSX, CSV, or PDF). Omit if bank_statement_id is set."),
    ] = None,
    bank_statement_id: Annotated[
        str | None,
        Form(description="ID of a previously uploaded bank statement from /bank-statements."),
    ] = None,
    base_currency: Annotated[str, Form()] = "MYR",
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str | None = Depends(require_tenant),
) -> JobCreateResponse:
    validated_currency = _validate_currency(base_currency)

    if not payment_proofs:
        raise HTTPException(status_code=400, detail="At least one payment proof is required")

    # Normalise bank_statement_id: treat whitespace-only as absent.
    bank_statement_id = (bank_statement_id or "").strip() or None

    if bank_statement is None and not bank_statement_id:
        raise HTTPException(
            status_code=400,
            detail="Provide either a bank_statement file or a bank_statement_id.",
        )
    if bank_statement is not None and bank_statement_id:
        raise HTTPException(
            status_code=400,
            detail="Provide bank_statement file OR bank_statement_id, not both.",
        )

    # Validate UUID format and ownership before creating the job.
    if bank_statement_id:
        try:
            stmt_uuid = UUID(bank_statement_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"bank_statement_id is not a valid UUID: {bank_statement_id!r}",
            ) from exc
        ledger_repo = BankLedgerRepository(session, tenant_id=tenant_id)
        if await ledger_repo.get_statement(stmt_uuid) is None:
            raise HTTPException(
                status_code=404,
                detail="bank_statement_id not found or does not belong to this tenant.",
            )

    storage = StorageService()
    storage.ensure_bucket()

    proof_keys: list[str] = []
    for f in payment_proofs:
        body = await f.read()
        key = storage.put_object(body, f.filename or "proof", content_type=f.content_type)
        proof_keys.append(key)

    stmt_key: str | None = None
    if bank_statement is not None:
        stmt_fmt = detect_source_format(
            bank_statement.filename or "statement",
            bank_statement.content_type,
        )
        if stmt_fmt not in {SourceFormat.EXCEL, SourceFormat.CSV, SourceFormat.PDF}:
            raise HTTPException(
                status_code=400,
                detail="Bank statement must be XLSX, CSV, or PDF. Image formats are not supported.",
            )
        stmt_body = await bank_statement.read()
        stmt_key = storage.put_object(
            stmt_body,
            bank_statement.filename or "statement",
            content_type=bank_statement.content_type,
        )

    repo = JobRepository(session, tenant_id=tenant_id)
    job = await repo.create_job(
        base_currency=validated_currency,
        payment_proof_keys=proof_keys,
        bank_statement_key=stmt_key,
        bank_statement_id=bank_statement_id,
        tenant_id=tenant_id,
    )

    bind_job_id(job.id)
    await enqueue_job(job.id)
    logger.info("job.created", proofs=len(proof_keys), ledger_stmt=bool(bank_statement_id))

    return JobCreateResponse(
        job_id=UUID(job.id), status=JobStatus(job.status), created_at=job.created_at
    )


@router.get("/{job_id}", response_model=JobStatusResponse)
async def get_job(
    job_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str | None = Depends(require_tenant),
) -> JobStatusResponse:
    repo = JobRepository(session, tenant_id=tenant_id)
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
    job_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str | None = Depends(require_tenant),
) -> ReconciliationReport:
    repo = JobRepository(session, tenant_id=tenant_id)
    try:
        job = await repo.get(job_id)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if not job.report_blob:
        raise HTTPException(status_code=409, detail=f"Job is {job.status}; report not yet available")

    return await hydrate_report(repo, job)


@router.get("/{job_id}/review", response_model=list[MatchResult])
async def get_review_queue(
    job_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str | None = Depends(require_tenant),
) -> list[MatchResult]:
    repo = JobRepository(session, tenant_id=tenant_id)
    try:
        job = await repo.get(job_id)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if job.status == JobStatus.FAILED:
        raise HTTPException(
            status_code=409,
            detail=job.error or "Job failed before the review queue was available",
        )

    matches = await repo.list_matches(job_id, status=MatchStatus.UNCERTAIN)
    return [MatchResult.model_validate(m.payload) for m in matches]
