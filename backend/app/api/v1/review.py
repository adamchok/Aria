"""Human review action endpoint — confirm / reject / manual_match."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db_session
from app.core.exceptions import MatchNotFoundError
from app.core.middleware import require_tenant
from app.models.enums import JobStatus, MatchStatus, ReviewAction
from app.models.schemas import MatchResult, ReviewActionRequest, ReviewActionResponse
from app.repositories.job_repository import JobRepository
from app.services.report_hydration import hydrate_report

router = APIRouter()


@router.post(
    "/{job_id}/review/{match_id}",
    response_model=ReviewActionResponse,
)
async def submit_review_action(
    job_id: UUID,
    match_id: UUID,
    payload: ReviewActionRequest,
    session: AsyncSession = Depends(get_db_session),
    tenant_id: str = Depends(require_tenant),
) -> ReviewActionResponse:
    repo = JobRepository(session, tenant_id=tenant_id)
    try:
        match = await repo.get_match(job_id, match_id)
    except MatchNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    # Idempotency: a confirm/reject on an already-reviewed match returns the
    # current state instead of erroring.
    if match.human_reviewed and payload.action != ReviewAction.MANUAL_MATCH:
        return ReviewActionResponse(
            match_id=UUID(match.id),
            status=MatchStatus(match.status),
            human_reviewed=True,
            note=match.review_notes,
        )

    if payload.action == ReviewAction.CONFIRM:
        new_status = MatchStatus.MATCHED
        bank_entry_payload = None
    elif payload.action == ReviewAction.REJECT:
        new_status = MatchStatus.UNMATCHED
        bank_entry_payload = None
    elif payload.action == ReviewAction.MANUAL_MATCH:
        if payload.bank_entry_id is None:
            raise HTTPException(
                status_code=400,
                detail="manual_match requires bank_entry_id",
            )
        new_status = MatchStatus.MATCHED
        # We don't persist the bank statement separately; the match payload
        # already carries the entry chosen during reasoning. For a manual
        # match we record the requested id so the UI can resolve it.
        existing_payload = dict(match.payload or {})
        existing_entry = existing_payload.get("bank_entry") or {}
        existing_entry["id"] = str(payload.bank_entry_id)
        bank_entry_payload = existing_entry

    updated = await repo.update_match(
        job_id,
        match_id,
        status=new_status,
        human_reviewed=True,
        review_notes=payload.note,
        bank_entry_payload=bank_entry_payload,
    )

    job = await repo.get(job_id)
    if job.report_blob:
        hydrated = await hydrate_report(repo, job)
        await repo.save_report(job_id, hydrated.model_dump(mode="json"))

    remaining_uncertain = await repo.list_matches(job_id, status=MatchStatus.UNCERTAIN)
    if not remaining_uncertain and job.status == JobStatus.AWAITING_REVIEW:
        await repo.update_status(job_id, status=JobStatus.COMPLETED)

    return ReviewActionResponse(
        match_id=UUID(updated.id),
        status=MatchStatus(updated.status),
        human_reviewed=True,
        note=updated.review_notes,
    )
