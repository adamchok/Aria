"""Stage 1/2 filters."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from app.agents.sdk.context import ReconciliationContext
from app.agents.sdk.stages.matching import _stage1_date_filter, _stage2_amount_filter, run_matching_stage
from app.core.config import Settings
from app.graph.state import ReconciliationState
from app.models.schemas import BankEntry
from uuid import uuid4


def _settings(**kwargs) -> Settings:
    return Settings(_env_file=None, **kwargs)


def test_stage1_date_filter_within_window(normalised_record_usd, bank_entry_myr):
    settings = _settings(date_window_days=5)
    kept = _stage1_date_filter(normalised_record_usd, [bank_entry_myr], set(), settings)
    assert len(kept) == 1


def test_stage1_date_filter_outside_window(normalised_record_usd, bank_entry_myr):
    settings = _settings(date_window_days=5)
    far = BankEntry(
        value_date=bank_entry_myr.value_date + timedelta(days=10),
        amount=bank_entry_myr.amount,
    )
    kept = _stage1_date_filter(normalised_record_usd, [far], set(), settings)
    assert kept == []


def test_stage2_amount_filter_in_window(normalised_record_usd, bank_entry_myr):
    settings = _settings()
    kept = _stage2_amount_filter(normalised_record_usd, [bank_entry_myr], settings)
    assert len(kept) == 1


def test_stage2_amount_filter_outside_window(normalised_record_usd):
    settings = _settings()
    low = normalised_record_usd.tolerance_low - Decimal("1000")
    entry = BankEntry(value_date=normalised_record_usd.payment.value_date, amount=low)
    kept = _stage2_amount_filter(normalised_record_usd, [entry], settings)
    assert kept == []
