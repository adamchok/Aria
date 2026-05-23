"""Agent 4 — Audit & Report.

Synthesises a ``ReconciliationReport`` (summary + narrative) from the
matches and produces the Excel artefact.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from app.agents.audit import make_audit_entry
from app.core.logging import get_logger
from app.graph.state import ReconciliationState
from app.models.enums import JobStatus, MatchStatus
from app.models.schemas import ReconciliationReport, ReconciliationSummary
from app.services.llm_client import LLMClient

logger = get_logger(__name__)


class ReportAgent:
    def __init__(self, llm: LLMClient | None = None) -> None:
        self._llm = llm or LLMClient()

    def __call__(self, state: ReconciliationState) -> ReconciliationState:
        return self.run(state)

    def run(self, state: ReconciliationState) -> ReconciliationState:
        state.status = JobStatus.REPORTING

        matches = state.match_results
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

        started = state.started_at or datetime.utcnow()
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

        narrative = self._llm.summarise_report(
            summary=summary.model_dump(mode="json"),
            exceptions=exceptions_payload,
        )

        state.report = ReconciliationReport(
            job_id=state.job_id,
            summary=summary,
            matches=matches,
            generated_at=finished,
            base_currency=state.base_currency,
            narrative=narrative,
        )
        state.finished_at = finished
        state.agents_completed.append("report")

        if uncertain:
            state.status = JobStatus.AWAITING_REVIEW
        else:
            state.status = JobStatus.COMPLETED

        state.audit_log.append(
            make_audit_entry(
                job_id=state.job_id,
                agent="report",
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
        return state
