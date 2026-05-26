"""Report generation stage."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from langsmith import traceable

from app.agents.audit import make_audit_entry
from app.agents.sdk.context import ReconciliationContext
from app.agents.sdk.llm_service import LLMService
from app.core.logging import get_logger
from app.models.enums import JobStatus, MatchStatus
from app.models.schemas import ReconciliationReport, ReconciliationSummary

logger = get_logger(__name__)

AGENT_NAME = "report"


@traceable(run_type="chain", name="report_stage")
def run_report_stage(ctx: ReconciliationContext, llm: LLMService | None = None) -> None:
    ctx.state.status = JobStatus.REPORTING
    llm = llm or LLMService(ctx.settings)

    matches = ctx.state.match_results
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

    started = ctx.state.started_at or datetime.utcnow()
    finished = datetime.utcnow()
    processing_seconds = max((finished - started).total_seconds(), 0.0)

    summary = ReconciliationSummary(
        total_records=len(matches),
        matched_count=len(matched),
        uncertain_count=len(uncertain),
        unmatched_count=len(unmatched),
        total_value_myr=total_value,
        matched_value_myr=matched_value,
        total_variance_myr=total_variance,
        processing_seconds=processing_seconds,
    )

    exceptions_payload = [
        {
            "status": m.status.value,
            "payer": m.normalised_record.payment.payer,
            "amount_original": str(m.normalised_record.payment.amount_original),
            "currency": m.normalised_record.payment.currency,
            "explanation": m.variance_explanation,
        }
        for m in matches
        if m.status != MatchStatus.MATCHED
    ]

    narrative = llm.summarise_report(
        summary=summary.model_dump(mode="json"),
        exceptions=exceptions_payload,
    )

    ctx.state.report = ReconciliationReport(
        job_id=ctx.job_id,
        summary=summary,
        matches=matches,
        bank_entries=list(ctx.state.bank_statement.entries) if ctx.state.bank_statement else [],
        generated_at=finished,
        base_currency=ctx.base_currency,
        narrative=narrative,
    )
    ctx.state.finished_at = finished
    ctx.state.agents_completed.append("report")

    if uncertain:
        ctx.state.status = JobStatus.AWAITING_REVIEW
    else:
        ctx.state.status = JobStatus.COMPLETED

    ctx.state.audit_log.append(
        make_audit_entry(
            job_id=ctx.job_id,
            agent=AGENT_NAME,
            action="report_generated",
            output_snapshot=summary.model_dump(mode="json"),
            reasoning=narrative,
        )
    )
    logger.info(
        "report.complete",
        matched=len(matched),
        uncertain=len(uncertain),
        unmatched=len(unmatched),
        duration_s=round(processing_seconds, 2),
    )
