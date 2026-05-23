"""Stage 1 (date) and Stage 2 (amount) filters for the Matching Agent."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from app.agents.matching import MatchingAgent
from app.core.config import Settings
from app.models.schemas import BankEntry


def _entry(value_date: date, amount: Decimal) -> BankEntry:
    return BankEntry(value_date=value_date, amount=amount, currency="MYR")


def test_stage1_date_filter_window(normalised_record_usd):
    agent = MatchingAgent(settings=Settings(_env_file=None, date_window_days=5))
    target = normalised_record_usd.payment.value_date
    entries = [
        _entry(target - timedelta(days=4), Decimal("42")),  # in
        _entry(target + timedelta(days=5), Decimal("42")),  # in (edge)
        _entry(target + timedelta(days=6), Decimal("42")),  # out
        _entry(target - timedelta(days=10), Decimal("42")),  # out
    ]
    kept = agent._stage1_date_filter(normalised_record_usd, entries, used=set())
    assert len(kept) == 2


def test_stage2_amount_filter_uses_tolerance_window(normalised_record_usd):
    agent = MatchingAgent(settings=Settings(_env_file=None))
    target = normalised_record_usd.payment.value_date
    in_window = _entry(target, normalised_record_usd.tolerance_low + Decimal("0.10"))
    above = _entry(target, normalised_record_usd.tolerance_high + Decimal("5"))
    below = _entry(target, normalised_record_usd.tolerance_low - Decimal("5"))
    kept = agent._stage2_amount_filter(normalised_record_usd, [in_window, above, below])
    assert kept == [in_window]


def test_stage1_excludes_already_used_entries(normalised_record_usd):
    agent = MatchingAgent(settings=Settings(_env_file=None))
    target = normalised_record_usd.payment.value_date
    e1 = _entry(target, Decimal("42"))
    e2 = _entry(target, Decimal("43"))
    used = {str(e1.id)}
    kept = agent._stage1_date_filter(normalised_record_usd, [e1, e2], used=used)
    assert kept == [e2]
