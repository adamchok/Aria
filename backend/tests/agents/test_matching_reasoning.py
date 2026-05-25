"""Stage 3 LLM reasoning routing and threshold enforcement."""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import asyncio

import pytest

from app.agents.sdk.context import ReconciliationContext
from app.agents.sdk.stages.matching import run_matching_stage
from app.core.config import Settings
from app.graph.state import ReconciliationState
from app.models.enums import MatchStatus
from app.models.schemas import BankEntry, BankStatement


def _settings(**kwargs) -> Settings:
    return Settings(_env_file=None, **kwargs)


def _state(normalised_record, entries):
    return ReconciliationState(
        job_id=uuid4(),
        normalised_records=[normalised_record],
        bank_statement=BankStatement(base_currency="MYR", entries=entries),
        base_currency="MYR",
    )


class _StubLLM:
    mode = "mock"

    def __init__(self, confidence_value: float):
        self._confidence = confidence_value

    def reason_match(self, *, normalised, candidate, candidate_scores):
        return {
            "confidence": self._confidence,
            "status": "MATCHED",
            "amount_variance_myr": "0",
            "variance_explanation": "",
            "reasoning_chain": "",
        }


def test_unmatched_when_no_candidates(normalised_record_usd):
    state = _state(normalised_record_usd, [])
    ctx = ReconciliationContext(state=state)
    asyncio.run(run_matching_stage(ctx, llm=_StubLLM(0.0)))  # type: ignore[arg-type]
    assert len(state.match_results) == 1
    assert state.match_results[0].status == MatchStatus.UNMATCHED
    assert state.match_results[0].confidence == 0.0


def test_matched_when_strong_candidate(normalised_record_usd):
    midpoint = (normalised_record_usd.tolerance_low + normalised_record_usd.tolerance_high) / 2
    entry = BankEntry(
        value_date=normalised_record_usd.payment.value_date,
        amount=midpoint,
        reference=normalised_record_usd.payment.reference,
        counterparty=normalised_record_usd.payment.payer,
        description="Inward TT",
    )
    state = _state(normalised_record_usd, [entry])
    ctx = ReconciliationContext(state=state)
    asyncio.run(run_matching_stage(ctx, llm=_StubLLM(0.9)))  # type: ignore[arg-type]
    result = state.match_results[0]
    assert result.status == MatchStatus.MATCHED
    assert result.confidence >= 0.75
    assert result.bank_entry is not None


@pytest.mark.parametrize(
    "confidence_value, expected_status",
    [
        (0.49, MatchStatus.UNMATCHED),
        (0.50, MatchStatus.UNCERTAIN),
        (0.74, MatchStatus.UNCERTAIN),
        (0.75, MatchStatus.MATCHED),
        (0.76, MatchStatus.MATCHED),
    ],
)
def test_threshold_enforcement(normalised_record_usd, confidence_value, expected_status):
    midpoint = (normalised_record_usd.tolerance_low + normalised_record_usd.tolerance_high) / 2
    entry = BankEntry(value_date=normalised_record_usd.payment.value_date, amount=midpoint)
    state = _state(normalised_record_usd, [entry])
    ctx = ReconciliationContext(state=state)
    asyncio.run(run_matching_stage(
        ctx,
        llm=_StubLLM(confidence_value),  # type: ignore[arg-type]
    ))
    assert state.match_results[0].status == expected_status
