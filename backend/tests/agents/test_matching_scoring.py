"""Stage 3 scoring — composite weights and component bounds."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from app.agents.matching import _W_AMOUNT, _W_DATE, _W_PAYER, _W_REF, MatchingAgent
from app.core.config import Settings
from app.models.schemas import BankEntry


def test_weights_sum_to_one():
    assert round(_W_AMOUNT + _W_DATE + _W_REF + _W_PAYER, 5) == 1.0


def test_score_perfect_match_caps_high(normalised_record_usd):
    midpoint = (normalised_record_usd.tolerance_low + normalised_record_usd.tolerance_high) / 2
    entry = BankEntry(
        value_date=normalised_record_usd.payment.value_date,
        amount=midpoint,
        reference=normalised_record_usd.payment.reference,
        counterparty=normalised_record_usd.payment.payer,
    )
    agent = MatchingAgent(settings=Settings(_env_file=None))
    score = agent._score(normalised_record_usd, entry)
    assert score.amount_match_score == 1.0
    assert score.date_proximity_score == 1.0
    assert score.composite > 0.9


def test_score_amount_at_window_edge_zero(normalised_record_usd):
    edge = normalised_record_usd.tolerance_low  # bottom edge
    entry = BankEntry(
        value_date=normalised_record_usd.payment.value_date,
        amount=edge,
    )
    score = MatchingAgent(settings=Settings(_env_file=None))._score(normalised_record_usd, entry)
    assert score.amount_match_score == 0.0


def test_score_date_drift_decays(normalised_record_usd):
    midpoint = (normalised_record_usd.tolerance_low + normalised_record_usd.tolerance_high) / 2
    entry = BankEntry(
        value_date=normalised_record_usd.payment.value_date + timedelta(days=5),
        amount=midpoint,
    )
    score = MatchingAgent(settings=Settings(_env_file=None, date_window_days=5))._score(
        normalised_record_usd, entry
    )
    assert score.date_proximity_score == 0.0
