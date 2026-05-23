"""Stage 3 LLM reasoning routing and threshold enforcement."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from app.agents.matching import MatchingAgent
from app.core.config import Settings
from app.graph.state import ReconciliationState
from app.models.enums import MatchStatus
from app.models.schemas import BankEntry, BankStatement


def _state(normalised_record, entries):
    return ReconciliationState(
        job_id=uuid4(),
        normalised_records=[normalised_record],
        bank_statement=BankStatement(base_currency="MYR", entries=entries),
        base_currency="MYR",
    )


def test_unmatched_when_no_candidates(normalised_record_usd):
    state = _state(normalised_record_usd, [])
    agent = MatchingAgent(settings=Settings(_env_file=None))
    out = agent(state)
    assert len(out.match_results) == 1
    assert out.match_results[0].status == MatchStatus.UNMATCHED
    assert out.match_results[0].confidence == 0.0


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
    out = MatchingAgent(settings=Settings(_env_file=None))(state)
    result = out.match_results[0]
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
def test_threshold_enforcement(monkeypatch, normalised_record_usd, confidence_value, expected_status):
    """LLM may return any status; threshold logic must dominate."""
    from app.services import llm_client

    class _StubLLM:
        mode = "mock"

        def reason_match(self, *, normalised, candidate, candidate_scores):
            return {
                "confidence": confidence_value,
                "status": "MATCHED",  # deliberately wrong; must be overridden
                "amount_variance_myr": "0",
                "variance_explanation": "",
                "reasoning_chain": "",
            }

    midpoint = (normalised_record_usd.tolerance_low + normalised_record_usd.tolerance_high) / 2
    entry = BankEntry(value_date=normalised_record_usd.payment.value_date, amount=midpoint)
    state = _state(normalised_record_usd, [entry])
    agent = MatchingAgent(llm=_StubLLM(), settings=Settings(_env_file=None))
    out = agent(state)
    assert out.match_results[0].status == expected_status
