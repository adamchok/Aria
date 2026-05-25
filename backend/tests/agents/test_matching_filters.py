"""Stage 1/2 filters."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from app.agents.sdk.context import ReconciliationContext
from app.agents.sdk.stages.matching import _description_rescue, _stage1_date_filter, _stage2_amount_filter, run_matching_stage
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
    kept = _stage2_amount_filter(normalised_record_usd, [bank_entry_myr])
    assert len(kept) == 1


def test_stage2_amount_filter_debit_in_window(normalised_record_usd, bank_entry_myr):
    # Debit entries are negative; abs() must be used for comparison.
    debit = BankEntry(
        value_date=bank_entry_myr.value_date,
        amount=-bank_entry_myr.amount,
        currency=bank_entry_myr.currency,
        description=bank_entry_myr.description,
    )
    kept = _stage2_amount_filter(normalised_record_usd, [debit])
    assert len(kept) == 1


def test_stage2_amount_filter_outside_window(normalised_record_usd):
    entry = BankEntry(
        value_date=normalised_record_usd.payment.value_date,
        amount=normalised_record_usd.tolerance_low - Decimal("1000"),
    )
    kept = _stage2_amount_filter(normalised_record_usd, [entry])
    assert kept == []


def test_description_rescue_finds_embedded_amount(normalised_record_usd):
    # Simulates SGD-extracted payment where bank description says "USD 42.30"
    # (amount matches original amount_original from the fixture: 10.00 USD)
    # Use the actual amount_original from the fixture
    amount = normalised_record_usd.payment.amount_original  # Decimal("10.00") from fixture
    entry = BankEntry(
        value_date=normalised_record_usd.payment.value_date,
        amount=Decimal("-999"),  # wrong MYR amount — would fail stage2
        description=f"POS DEBIT ACME INC SAN FRA (USD {amount}) 01/01/2026 ACME USD{amount}",
    )
    rescued = _description_rescue(normalised_record_usd, [entry], [])
    assert len(rescued) == 1


def test_description_rescue_ignores_wrong_amount(normalised_record_usd):
    entry = BankEntry(
        value_date=normalised_record_usd.payment.value_date,
        amount=Decimal("-999"),
        description="POS DEBIT GRAMMARLY USD60.00 SOME DESCRIPTION",
    )
    rescued = _description_rescue(normalised_record_usd, [entry], [])
    assert rescued == []
