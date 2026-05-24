"""Report stage tests."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.agents.sdk.context import ReconciliationContext
from app.agents.sdk.stages.report import run_report_stage
from app.graph.state import ReconciliationState
from app.models.enums import JobStatus, MatchStatus, SourceFormat
from app.models.schemas import MatchResult, NormalisedRecord, PaymentRecord


def _match(status: MatchStatus) -> MatchResult:
    payment = PaymentRecord(
        payer="A",
        payee="B",
        amount_original=Decimal("100"),
        currency="USD",
        value_date=date(2026, 5, 1),
        source_format=SourceFormat.IMAGE,
        extraction_confidence=0.9,
    )
    nr = NormalisedRecord(
        payment=payment,
        amount_myr_at_invoice_rate=Decimal("420"),
        amount_myr_at_settlement_rate=Decimal("425"),
        fx_rate_invoice=Decimal("4.2"),
        fx_rate_settlement=Decimal("4.25"),
        tolerance_low=Decimal("400"),
        tolerance_high=Decimal("450"),
        estimated_charges_myr=Decimal("5"),
        base_currency="MYR",
    )
    return MatchResult(
        normalised_record=nr,
        confidence=0.8 if status != MatchStatus.UNMATCHED else 0.2,
        status=status,
        amount_variance_myr=Decimal("0"),
        variance_explanation="",
        reasoning_chain="",
    )


def test_report_completed_when_all_matched():
    state = ReconciliationState(
        job_id=uuid4(),
        match_results=[_match(MatchStatus.MATCHED)],
        base_currency="MYR",
    )
    ctx = ReconciliationContext(state=state)
    run_report_stage(ctx)
    assert state.status == JobStatus.COMPLETED
    assert state.report is not None
    assert state.report.summary.matched_count == 1


def test_report_awaiting_review_when_uncertain():
    state = ReconciliationState(
        job_id=uuid4(),
        match_results=[_match(MatchStatus.UNCERTAIN)],
        base_currency="MYR",
    )
    ctx = ReconciliationContext(state=state)
    run_report_stage(ctx)
    assert state.status == JobStatus.AWAITING_REVIEW
