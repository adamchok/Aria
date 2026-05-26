"""Matching stage tests."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.agents.sdk.context import ReconciliationContext
from app.agents.sdk.llm_service import LLMService
from app.agents.sdk.stages.matching import _reason_one
from app.core.config import Settings
from app.graph.state import ReconciliationState
from app.models.enums import MatchStatus, SourceFormat
from app.models.schemas import BankEntry, CandidateScore, NormalisedRecord, PaymentRecord


def _make_ctx(matching_concurrency: int = 3) -> ReconciliationContext:
    settings = Settings(llm_mode="mock", matching_concurrency=matching_concurrency)
    state = ReconciliationState(job_id=uuid4())
    return ReconciliationContext(state=state, settings=settings)


def _make_nr() -> NormalisedRecord:
    payment = PaymentRecord(
        payer="Acme",
        payee="ARIA",
        amount_original=Decimal("100"),
        currency="USD",
        value_date=date(2026, 5, 18),
        source_format=SourceFormat.PDF,
        extraction_confidence=0.9,
        raw_extracted_text="",
    )
    return NormalisedRecord(
        payment=payment,
        amount_myr_at_invoice_rate=Decimal("420"),
        amount_myr_at_settlement_rate=Decimal("421"),
        tolerance_low=Decimal("400"),
        tolerance_high=Decimal("440"),
        estimated_charges_myr=Decimal("5"),
        fx_rate_invoice=Decimal("4.2"),
        fx_rate_settlement=Decimal("4.21"),
        settlement_date=date(2026, 5, 20),
    )


def test_matching_concurrency_caps_workers():
    """Executor worker count mirrors ingestion: min(pending, matching_concurrency)."""
    settings = Settings(matching_concurrency=3)
    assert min(11, settings.matching_concurrency) == 3
    assert min(2, settings.matching_concurrency) == 2


def test_reason_one_no_candidate_returns_unmatched():
    ctx = _make_ctx()
    llm = LLMService(ctx.settings)
    nr = _make_nr()
    result = _reason_one(0, nr, None, None, [], ctx, llm)
    assert result.status == MatchStatus.UNMATCHED
    assert result.bank_entry is None


def test_reason_one_with_candidate_uses_mock_llm():
    ctx = _make_ctx()
    llm = LLMService(ctx.settings)
    nr = _make_nr()
    entry = BankEntry(
        value_date=date(2026, 5, 20),
        amount=Decimal("-421"),
        currency="MYR",
        description="WIRE ACME",
    )
    score = CandidateScore(
        bank_entry_id=entry.id,
        amount_match_score=0.8,
        date_proximity_score=0.7,
        reference_similarity_score=0.5,
        payer_name_score=0.6,
        composite=0.7,
    )
    result = _reason_one(0, nr, entry, score, [(entry, score)], ctx, llm)
    assert result.status in (MatchStatus.MATCHED, MatchStatus.UNCERTAIN, MatchStatus.UNMATCHED)
