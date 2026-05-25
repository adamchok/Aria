"""Analytics summary endpoint."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import get_db_session
from app.core.middleware import require_admin, require_tenant
from app.models.database import JobORM, MatchORM, TenantORM
from app.models.enums import JobStatus, MatchStatus
from app.models.schemas import (
    AdminAnalyticsSummary,
    AdminTenantAnalytics,
    AIPerformanceSummary,
    AnalyticsCorridorBreakdown,
    AnalyticsSummary,
    ConfidenceBucket,
    EscalationBreakdownResponse,
    EscalationPayeeBreakdown,
    JobProcessingPoint,
)

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
    # Escalation = records that were routed to human review, whether still pending
    # (UNCERTAIN) or already resolved (human_reviewed=True, status changed to
    # MATCHED/UNMATCHED). Counting only current UNCERTAIN misses all reviewed items.
    escalated = sum(
        1 for m in all_matches
        if m.human_reviewed or m.status == MatchStatus.UNCERTAIN.value
    )
    escalation_rate = escalated / total_records if total_records > 0 else 0.0

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


@router.get("/performance", response_model=AIPerformanceSummary)
async def ai_performance_summary(
    tenant_id: str = Depends(require_tenant),
    period_start: date = Query(default=None),
    period_end: date = Query(default=None),
    session: AsyncSession = Depends(get_db_session),
) -> AIPerformanceSummary:
    today = date.today()
    if period_end is None:
        period_end = today
    if period_start is None:
        period_start = today - timedelta(days=30)

    jobs_result = await session.execute(
        select(JobORM).where(
            JobORM.tenant_id == tenant_id,
            JobORM.status == JobStatus.COMPLETED.value,
            func.date(JobORM.created_at) >= period_start,
            func.date(JobORM.created_at) <= period_end,
        )
    )
    jobs = jobs_result.scalars().all()
    job_ids = [j.id for j in jobs]

    empty = AIPerformanceSummary(
        period_start=period_start,
        period_end=period_end,
        total_records=0,
        avg_confidence=0.0,
        confidence_buckets=[
            ConfidenceBucket(label="< 50%", min_val=0.0, max_val=0.5, count=0, pct=0.0),
            ConfidenceBucket(label="50–75%", min_val=0.5, max_val=0.75, count=0, pct=0.0),
            ConfidenceBucket(label="75–90%", min_val=0.75, max_val=0.9, count=0, pct=0.0),
            ConfidenceBucket(label="≥ 90%", min_val=0.9, max_val=1.0, count=0, pct=0.0),
        ],
        auto_matched_count=0,
        human_confirmed_count=0,
        human_rejected_count=0,
        human_review_confirmation_rate=0.0,
        match_rate_target_met=False,
        escalation_in_target_range=False,
        processing_target_met=False,
        avg_processing_seconds=0.0,
        recent_jobs=[],
    )

    if not job_ids:
        return empty

    matches_result = await session.execute(
        select(MatchORM).where(MatchORM.job_id.in_(job_ids))
    )
    all_matches = matches_result.scalars().all()

    if not all_matches:
        return empty

    total_records = len(all_matches)
    avg_confidence = sum(m.confidence for m in all_matches) / total_records

    # Confidence buckets
    buckets = [
        {"label": "< 50%", "min_val": 0.0, "max_val": 0.5, "count": 0},
        {"label": "50–75%", "min_val": 0.5, "max_val": 0.75, "count": 0},
        {"label": "75–90%", "min_val": 0.75, "max_val": 0.9, "count": 0},
        {"label": "≥ 90%", "min_val": 0.9, "max_val": 1.0, "count": 0},
    ]
    for m in all_matches:
        c = m.confidence
        if c < 0.5:
            buckets[0]["count"] += 1
        elif c < 0.75:
            buckets[1]["count"] += 1
        elif c < 0.9:
            buckets[2]["count"] += 1
        else:
            buckets[3]["count"] += 1

    confidence_buckets = [
        ConfidenceBucket(
            label=b["label"],
            min_val=b["min_val"],
            max_val=b["max_val"],
            count=b["count"],
            pct=b["count"] / total_records if total_records > 0 else 0.0,
        )
        for b in buckets
    ]

    # Human review outcomes
    # auto-matched: status=MATCHED, not human_reviewed
    # human-confirmed: human_reviewed=True, status=MATCHED
    # human-rejected: human_reviewed=True, status=UNMATCHED
    auto_matched_count = sum(
        1 for m in all_matches
        if not m.human_reviewed and m.status == MatchStatus.MATCHED.value
    )
    human_confirmed_count = sum(
        1 for m in all_matches
        if m.human_reviewed and m.status == MatchStatus.MATCHED.value
    )
    human_rejected_count = sum(
        1 for m in all_matches
        if m.human_reviewed and m.status == MatchStatus.UNMATCHED.value
    )
    total_reviewed = human_confirmed_count + human_rejected_count
    human_review_confirmation_rate = (
        human_confirmed_count / total_reviewed if total_reviewed > 0 else 0.0
    )

    # Target checks
    matched_count = sum(1 for m in all_matches if m.status == MatchStatus.MATCHED.value)
    uncertain_count = sum(1 for m in all_matches if m.status == MatchStatus.UNCERTAIN.value)
    match_rate = matched_count / total_records if total_records > 0 else 0.0
    escalated_count = sum(
        1 for m in all_matches
        if m.human_reviewed or m.status == MatchStatus.UNCERTAIN.value
    )
    escalation_rate = escalated_count / total_records if total_records > 0 else 0.0

    processing_times = [
        (j.updated_at - j.created_at).total_seconds()
        for j in jobs
        if j.updated_at and j.created_at
    ]
    avg_processing_seconds = (
        sum(processing_times) / len(processing_times) if processing_times else 0.0
    )

    # Per-job processing points (last 20, newest first)
    job_match_count: dict[str, int] = {}
    for m in all_matches:
        job_match_count[m.job_id] = job_match_count.get(m.job_id, 0) + 1

    sorted_jobs = sorted(jobs, key=lambda j: j.created_at, reverse=True)[:20]
    recent_jobs = [
        JobProcessingPoint(
            job_id=j.id,
            created_at=j.created_at,
            processing_seconds=(j.updated_at - j.created_at).total_seconds()
            if j.updated_at and j.created_at
            else 0.0,
            record_count=job_match_count.get(j.id, 0),
        )
        for j in reversed(sorted_jobs)
    ]

    return AIPerformanceSummary(
        period_start=period_start,
        period_end=period_end,
        total_records=total_records,
        avg_confidence=avg_confidence,
        confidence_buckets=confidence_buckets,
        auto_matched_count=auto_matched_count,
        human_confirmed_count=human_confirmed_count,
        human_rejected_count=human_rejected_count,
        human_review_confirmation_rate=human_review_confirmation_rate,
        match_rate_target_met=match_rate >= 0.9,
        escalation_in_target_range=0.05 <= escalation_rate <= 0.20,
        processing_target_met=avg_processing_seconds < 60.0,
        avg_processing_seconds=avg_processing_seconds,
        recent_jobs=recent_jobs,
    )


@router.get("/admin/summary", response_model=AdminAnalyticsSummary)
async def admin_analytics_summary(
    period_start: date = Query(default=None),
    period_end: date = Query(default=None),
    session: AsyncSession = Depends(get_db_session),
    _: None = Depends(require_admin),
) -> AdminAnalyticsSummary:
    today = date.today()
    if period_end is None:
        period_end = today
    if period_start is None:
        period_start = today - timedelta(days=30)

    tenants_result = await session.execute(select(TenantORM))
    tenants = {t.id: t for t in tenants_result.scalars().all()}

    jobs_stmt = select(JobORM).where(
        JobORM.status == JobStatus.COMPLETED.value,
        func.date(JobORM.created_at) >= period_start,
        func.date(JobORM.created_at) <= period_end,
    )
    jobs_result = await session.execute(jobs_stmt)
    jobs = jobs_result.scalars().all()
    job_ids = [j.id for j in jobs]

    if not job_ids:
        return AdminAnalyticsSummary(
            period_start=period_start,
            period_end=period_end,
            total_tenants=len(tenants),
            total_jobs=0,
            total_records=0,
            matched_records=0,
            uncertain_records=0,
            unmatched_records=0,
            avg_match_rate=0.0,
            escalation_rate=0.0,
            by_tenant=[],
        )

    matches_result = await session.execute(select(MatchORM).where(MatchORM.job_id.in_(job_ids)))
    all_matches = matches_result.scalars().all()

    total_records = len(all_matches)
    matched = sum(1 for m in all_matches if m.status == MatchStatus.MATCHED.value)
    uncertain = sum(1 for m in all_matches if m.status == MatchStatus.UNCERTAIN.value)
    unmatched = sum(1 for m in all_matches if m.status == MatchStatus.UNMATCHED.value)
    avg_match_rate = matched / total_records if total_records > 0 else 0.0
    escalated = sum(
        1 for m in all_matches
        if m.human_reviewed or m.status == MatchStatus.UNCERTAIN.value
    )
    escalation_rate = escalated / total_records if total_records > 0 else 0.0

    by_tenant: list[AdminTenantAnalytics] = []
    jobs_by_tenant: dict[str, list[JobORM]] = {}
    for j in jobs:
        if j.tenant_id:
            jobs_by_tenant.setdefault(j.tenant_id, []).append(j)

    for tid, tjobs in jobs_by_tenant.items():
        tjob_ids = {j.id for j in tjobs}
        tmatches = [m for m in all_matches if m.job_id in tjob_ids]
        tmatched = sum(1 for m in tmatches if m.status == MatchStatus.MATCHED.value)
        trate = tmatched / len(tmatches) if tmatches else 0.0
        tescalated = sum(
            1 for m in tmatches
            if m.human_reviewed or m.status == MatchStatus.UNCERTAIN.value
        )
        terate = tescalated / len(tmatches) if tmatches else 0.0
        tenant = tenants.get(tid)
        by_tenant.append(
            AdminTenantAnalytics(
                tenant_id=tid,  # type: ignore[arg-type]
                tenant_name=tenant.name if tenant else tid,
                total_jobs=len(tjobs),
                total_records=len(tmatches),
                matched_records=tmatched,
                avg_match_rate=trate,
                escalation_rate=terate,
            )
        )

    return AdminAnalyticsSummary(
        period_start=period_start,
        period_end=period_end,
        total_tenants=len(tenants),
        total_jobs=len(jobs),
        total_records=total_records,
        matched_records=matched,
        uncertain_records=uncertain,
        unmatched_records=unmatched,
        avg_match_rate=avg_match_rate,
        escalation_rate=escalation_rate,
        by_tenant=sorted(by_tenant, key=lambda t: t.total_records, reverse=True),
    )


@router.get("/escalation-breakdown", response_model=EscalationBreakdownResponse)
async def escalation_breakdown(
    tenant_id: str = Depends(require_tenant),
    group_by: Literal["payee", "corridor"] = Query(default="payee"),
    period_start: date = Query(default=None),
    period_end: date = Query(default=None),
    session: AsyncSession = Depends(get_db_session),
) -> EscalationBreakdownResponse:
    today = date.today()
    if period_end is None:
        period_end = today
    if period_start is None:
        period_start = today - timedelta(days=30)

    jobs_result = await session.execute(
        select(JobORM).where(
            JobORM.tenant_id == tenant_id,
            JobORM.status == JobStatus.COMPLETED.value,
            func.date(JobORM.created_at) >= period_start,
            func.date(JobORM.created_at) <= period_end,
        )
    )
    jobs = jobs_result.scalars().all()
    job_ids = [j.id for j in jobs]

    if not job_ids:
        return EscalationBreakdownResponse(
            group_by=group_by,
            period_start=period_start,
            period_end=period_end,
            breakdowns=[],
        )

    matches_result = await session.execute(select(MatchORM).where(MatchORM.job_id.in_(job_ids)))
    all_matches = matches_result.scalars().all()

    groups: dict[str, list[MatchORM]] = {}
    for m in all_matches:
        payload = m.payload or {}
        nr = payload.get("normalised_record", {})
        payment = nr.get("payment", {})
        if group_by == "payee":
            key = payment.get("payee", "Unknown")
        else:
            key = payment.get("currency", "Unknown")
        groups.setdefault(key, []).append(m)

    breakdowns = [
        EscalationPayeeBreakdown(
            group_key=key,
            total_count=len(group_matches),
            escalated_count=sum(
                1 for m in group_matches
                if m.human_reviewed or m.status == MatchStatus.UNCERTAIN.value
            ),
        )
        for key, group_matches in sorted(groups.items(), key=lambda kv: len(kv[1]), reverse=True)
    ]

    return EscalationBreakdownResponse(
        group_by=group_by,
        period_start=period_start,
        period_end=period_end,
        breakdowns=breakdowns,
    )
