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

_TERMINAL_STATUSES = {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED}
_CANCELLABLE_STATUSES = {
    JobStatus.PENDING,
    JobStatus.INGESTING,
    JobStatus.NORMALISING,
    JobStatus.MATCHING,
    JobStatus.REPORTING,
    JobStatus.AWAITING_REVIEW,
}
from app.models.schemas import (
    BankEntry,
    DryRunResponse,
    JobCreateResponse,
    JobListItem,
    JobListResponse,
    JobStatusResponse,
    MatchResult,
    ReconciliationReport,
)
from app.repositories.bank_account_repository import BankAccountRepository
from app.repositories.bank_ledger_repository import BankLedgerRepository
from app.repositories.job_repository import JobRepository
from app.services.job_bank_entries import list_job_bank_entries
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


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_job(
    request: Request,
    payment_proofs: Annotated[list[UploadFile], File(description="Payment proofs (multi-file)")],
    bank_statement: Annotated[
        UploadFile | None,
        File(description="Bank statement file (XLSX, CSV, or PDF). Omit when using ledger references."),
    ] = None,
    bank_statement_id: Annotated[
        str | None,
        Form(description="ID of a previously uploaded bank statement from /bank-statements."),
    ] = None,
    bank_account_id: Annotated[
        str | None,
        Form(
            description=(
                "ID of a registered bank account. Uses all pending (uncleared) ledger "
                "entries across every statement for that account."
            ),
        ),
    ] = None,
    base_currency: Annotated[str, Form()] = "MYR",
    dry_run: bool = Query(default=False),
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str | None = Depends(require_tenant),
) -> JobCreateResponse | DryRunResponse:
    validated_currency = _validate_currency(base_currency)

    if not payment_proofs:
        raise HTTPException(status_code=400, detail="At least one payment proof is required")

    # Normalise optional ledger references.
    bank_statement_id = (bank_statement_id or "").strip() or None
    bank_account_id = (bank_account_id or "").strip() or None

    bank_sources = [
        bank_statement is not None,
        bool(bank_statement_id),
        bool(bank_account_id),
    ]
    if not any(bank_sources):
        raise HTTPException(
            status_code=400,
            detail=(
                "Provide exactly one of: bank_statement file, bank_statement_id, "
                "or bank_account_id."
            ),
        )
    if sum(bank_sources) > 1:
        raise HTTPException(
            status_code=400,
            detail="Provide only one bank source: file, bank_statement_id, or bank_account_id.",
        )

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

    if bank_account_id:
        try:
            account_uuid = UUID(bank_account_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail=f"bank_account_id is not a valid UUID: {bank_account_id!r}",
            ) from exc
        account_repo = BankAccountRepository(session, tenant_id=tenant_id)
        account = await account_repo.get(account_uuid)
        if account is None:
            raise HTTPException(
                status_code=404,
                detail="bank_account_id not found or does not belong to this tenant.",
            )
        stats = await account_repo.get_stats(account_uuid)
        if stats["uncleared_count"] == 0:
            raise HTTPException(
                status_code=400,
                detail="No pending ledger entries for this bank account.",
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

    if dry_run:
        from datetime import datetime
        from uuid import uuid4

        from app.agents.sdk.runner import run_reconciliation
        from app.graph.state import DocumentInput, ReconciliationState
        from app.repositories.vendor_rules_repository import VendorRulesRepository

        tmp_id = uuid4()
        docs = [DocumentInput(storage_key=k, filename=k.rsplit("/", 1)[-1]) for k in proof_keys]
        for doc in docs:
            doc.bytes_data = storage.get_object(doc.storage_key)

        stmt_input = None
        if stmt_key:
            stmt_input = DocumentInput(storage_key=stmt_key, filename=stmt_key.rsplit("/", 1)[-1])
            stmt_input.bytes_data = storage.get_object(stmt_key)

        dry_state = ReconciliationState(
            job_id=tmp_id,
            base_currency=validated_currency,
            payment_documents=docs,
            bank_statement_input=stmt_input,
            started_at=datetime.utcnow(),
        )
        vendor_rules: list[dict] = []
        if tenant_id:
            rules_repo = VendorRulesRepository(session, tenant_id=tenant_id)
            vendor_rules = await rules_repo.find_for_tenant()

        dry_state = await run_reconciliation(dry_state, tenant_id=tenant_id, vendor_rules=vendor_rules)
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=200,
            content=DryRunResponse(
                job_id=tmp_id,
                dry_run=True,
                report=dry_state.report,
            ).model_dump(mode="json"),
        )

    repo = JobRepository(session, tenant_id=tenant_id)
    job = await repo.create_job(
        base_currency=validated_currency,
        payment_proof_keys=proof_keys,
        bank_statement_key=stmt_key,
        bank_statement_id=bank_statement_id,
        bank_account_id=bank_account_id,
        tenant_id=tenant_id,
    )

    bind_job_id(job.id)
    await enqueue_job(job.id)
    logger.info(
        "job.created",
        proofs=len(proof_keys),
        ledger_stmt=bool(bank_statement_id),
        ledger_account=bool(bank_account_id),
    )

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


@router.get("/{job_id}/bank-entries", response_model=list[BankEntry])
async def get_job_bank_entries(
    job_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str | None = Depends(require_tenant),
) -> list[BankEntry]:
    """Bank ledger rows available for manual match in the review queue."""
    repo = JobRepository(session, tenant_id=tenant_id)
    try:
        job = await repo.get(job_id)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    ledger = BankLedgerRepository(session, tenant_id=tenant_id)
    return await list_job_bank_entries(job, repo, ledger)


@router.post("/{job_id}/cancel", response_model=JobStatusResponse)
async def cancel_job(
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

    if JobStatus(job.status) not in _CANCELLABLE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=f"Job is {job.status} and cannot be cancelled.",
        )

    job = await repo.update_status(
        job_id,
        status=JobStatus.CANCELLED,
        error="Cancelled by user",
    )
    return JobStatusResponse(
        job_id=UUID(job.id),
        status=JobStatus(job.status),
        progress_pct=job.progress_pct,
        agents_completed=list(job.agents_completed or []),
        error=job.error,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_job(
    job_id: UUID,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str | None = Depends(require_tenant),
) -> None:
    repo = JobRepository(session, tenant_id=tenant_id)
    try:
        job = await repo.get(job_id)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    if JobStatus(job.status) not in _TERMINAL_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=f"Job is {job.status}. Cancel the job before deleting.",
        )

    await repo.delete_job(job_id)
