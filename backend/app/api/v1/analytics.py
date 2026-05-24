"""Analytics summary endpoint."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db_session
from app.core.middleware import require_tenant
from app.models.database import JobORM, MatchORM
from app.models.enums import JobStatus, MatchStatus
from app.models.schemas import AnalyticsCorridorBreakdown, AnalyticsSummary

router = APIRouter()


@router.get("/summary", response_model=AnalyticsSummary)
async def analytics_summary(
    tenant_id: str = Depends(require_tenant),
    period_start: date = Query(default=None),
    period_end: date = Query(default=None),
    session: AsyncSession = Depends(get_db_session),
) -> AnalyticsSummary:
    today = date.today()
    if period_end is None:
        period_end = today
    if period_start is None:
        period_start = today - timedelta(days=30)

    # Jobs in period, scoped to tenant
    jobs_stmt = (
        select(JobORM)
        .where(
            JobORM.tenant_id == tenant_id,
            JobORM.status == JobStatus.COMPLETED.value,
            func.date(JobORM.created_at) >= period_start,
            func.date(JobORM.created_at) <= period_end,
        )
    )
    jobs_result = await session.execute(jobs_stmt)
    jobs = jobs_result.scalars().all()

    total_jobs = len(jobs)
    job_ids = [j.id for j in jobs]

    if not job_ids:
        return AnalyticsSummary(
            tenant_id=tenant_id,  # type: ignore[arg-type]
            period_start=period_start,
            period_end=period_end,
            total_jobs=0,
            total_records=0,
            matched_records=0,
            uncertain_records=0,
            unmatched_records=0,
            avg_match_rate=0.0,
            avg_processing_seconds=0.0,
            escalation_rate=0.0,
            by_corridor=[],
        )

    # Match counts
    matches_stmt = select(MatchORM).where(MatchORM.job_id.in_(job_ids))
    matches_result = await session.execute(matches_stmt)
    all_matches = matches_result.scalars().all()

    total_records = len(all_matches)
    matched = sum(1 for m in all_matches if m.status == MatchStatus.MATCHED.value)
    uncertain = sum(1 for m in all_matches if m.status == MatchStatus.UNCERTAIN.value)
    unmatched = sum(1 for m in all_matches if m.status == MatchStatus.UNMATCHED.value)

    avg_match_rate = matched / total_records if total_records > 0 else 0.0
    escalation_rate = uncertain / total_records if total_records > 0 else 0.0

    # Processing time — diff between created_at and updated_at for completed jobs
    processing_times = [
        (j.updated_at - j.created_at).total_seconds()
        for j in jobs
        if j.updated_at and j.created_at
    ]
    avg_processing_seconds = (
        sum(processing_times) / len(processing_times) if processing_times else 0.0
    )

    # By corridor: group jobs by base_currency as a proxy for corridor
    corridor_map: dict[str, list[JobORM]] = {}
    for j in jobs:
        key = f"*/{j.base_currency}"
        corridor_map.setdefault(key, []).append(j)

    by_corridor: list[AnalyticsCorridorBreakdown] = []
    for corridor, cjobs in corridor_map.items():
        cjob_ids = {j.id for j in cjobs}
        cmatches = [m for m in all_matches if m.job_id in cjob_ids]
        cmatched = sum(1 for m in cmatches if m.status == MatchStatus.MATCHED.value)
        crate = cmatched / len(cmatches) if cmatches else 0.0
        by_corridor.append(
            AnalyticsCorridorBreakdown(
                corridor=corridor,
                job_count=len(cjobs),
                record_count=len(cmatches),
                avg_match_rate=crate,
            )
        )

    return AnalyticsSummary(
        tenant_id=tenant_id,  # type: ignore[arg-type]
        period_start=period_start,
        period_end=period_end,
        total_jobs=total_jobs,
        total_records=total_records,
        matched_records=matched,
        uncertain_records=uncertain,
        unmatched_records=unmatched,
        avg_match_rate=avg_match_rate,
        avg_processing_seconds=avg_processing_seconds,
        escalation_rate=escalation_rate,
        by_corridor=sorted(by_corridor, key=lambda c: c.record_count, reverse=True),
    )
