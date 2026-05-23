"""Merge live match rows into a stored reconciliation report snapshot."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from app.models.database import JobORM
from app.models.enums import MatchStatus
from app.models.schemas import MatchResult, ReconciliationReport, ReconciliationSummary
from app.repositories.job_repository import JobRepository


def recompute_summary(
    matches: list[MatchResult], *, processing_seconds: float
) -> ReconciliationSummary:
    matched = [m for m in matches if m.status == MatchStatus.MATCHED]
    uncertain = [m for m in matches if m.status == MatchStatus.UNCERTAIN]
    unmatched = [m for m in matches if m.status == MatchStatus.UNMATCHED]
    total_value = sum(
        (m.normalised_record.amount_myr_at_settlement_rate for m in matches),
        start=Decimal("0"),
    )
    matched_value = sum(
        (m.normalised_record.amount_myr_at_settlement_rate for m in matched),
        start=Decimal("0"),
    )
    total_variance = sum((m.amount_variance_myr for m in matches), start=Decimal("0"))
    return ReconciliationSummary(
        total_records=len(matches),
        matched_count=len(matched),
        uncertain_count=len(uncertain),
        unmatched_count=len(unmatched),
        total_value_myr=total_value,
        matched_value_myr=matched_value,
        total_variance_myr=total_variance,
        processing_seconds=processing_seconds,
    )


async def hydrate_report(repo: JobRepository, job: JobORM) -> ReconciliationReport:
    """Return the stored report with matches and summary refreshed from the DB."""
    if not job.report_blob:
        raise ValueError("Job has no report snapshot")

    report = ReconciliationReport.model_validate(job.report_blob)
    rows = await repo.list_matches(job.id)
    if not rows:
        return report

    matches: list[MatchResult] = []
    for row in rows:
        payload = dict(row.payload or {})
        status = row.status.value if isinstance(row.status, MatchStatus) else str(row.status)
        payload["status"] = status
        payload["human_reviewed"] = row.human_reviewed
        if row.review_notes is not None:
            payload["review_notes"] = row.review_notes
        matches.append(MatchResult.model_validate(payload))

    summary = recompute_summary(matches, processing_seconds=report.summary.processing_seconds)
    return report.model_copy(
        update={
            "job_id": UUID(str(job.id)),
            "matches": matches,
            "summary": summary,
        }
    )
