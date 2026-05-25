"""Stage 3 scoring — composite weights and component bounds."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from app.agents.sdk.stages.matching import _W_AMOUNT, _W_DATE, _W_PAYER, _W_REF, _score
from app.core.config import Settings
from app.models.enums import SourceFormat
from app.models.schemas import BankEntry, NormalisedRecord, PaymentRecord


def _settings(**kwargs) -> Settings:
    return Settings(_env_file=None, **kwargs)


def test_weights_sum_to_one():
    assert round(_W_AMOUNT + _W_DATE + _W_REF + _W_PAYER, 5) == 1.0


def test_score_perfect_match_caps_high(normalised_record_usd):
    entry = BankEntry(
        value_date=normalised_record_usd.payment.value_date,
        amount=normalised_record_usd.amount_myr_at_settlement_rate,
        reference=normalised_record_usd.payment.reference,
        counterparty=normalised_record_usd.payment.payer,
    )
    score = _score(normalised_record_usd, entry, _settings())
    assert score.amount_match_score == 1.0
    assert score.date_proximity_score == 1.0
    assert score.composite > 0.9


def test_score_amount_at_window_edge_zero(normalised_record_usd):
    edge = normalised_record_usd.tolerance_low
    entry = BankEntry(
        value_date=normalised_record_usd.payment.value_date,
        amount=edge,
    )
    score = _score(normalised_record_usd, entry, _settings())
    # In-band edge scores floor at 0.5 (see matching._score docstring).
    assert score.amount_match_score == 0.5


def test_score_prefers_card_debit_with_foreign_amount_and_payee():
    payment = PaymentRecord(
        payer="Ho Tak Technology",
        payee="Anthropic, PBC",
        amount_original=Decimal("20.00"),
        currency="USD",
        value_date=date(2026, 4, 28),
        reference="2331-8730-5217",
        source_format=SourceFormat.IMAGE,
        extraction_confidence=0.95,
    )
    nr = NormalisedRecord(
        payment=payment,
        amount_myr_at_invoice_rate=Decimal("79.05"),
        amount_myr_at_settlement_rate=Decimal("79.40"),
        fx_rate_invoice=Decimal("3.9525"),
        fx_rate_settlement=Decimal("3.97"),
        tolerance_low=Decimal("77.86"),
        tolerance_high=Decimal("82.58"),
        estimated_charges_myr=Decimal("47.64"),
        base_currency="MYR",
    )
    anthropic = BankEntry(
        value_date=date(2026, 4, 30),
        amount=Decimal("80.78"),
        description="POS DEBIT ANTHROPIC SAN FRA (USD 20.00)",
        reference="T13825",
        counterparty="ANTHROPIC SAN FRA",
    )
    cursor = BankEntry(
        value_date=date(2026, 4, 25),
        amount=Decimal("40.40"),
        description="POS DEBIT CURSOR USAGE SAN FRA (USD 10.00)",
        reference="T26854",
        counterparty="CURSOR USAGE SAN FRA",
    )
    anthropic_score = _score(nr, anthropic, _settings())
    cursor_score = _score(nr, cursor, _settings())
    assert anthropic_score.composite > cursor_score.composite
    assert anthropic_score.composite >= 0.5


def test_score_date_drift_decays(normalised_record_usd):
    entry = BankEntry(
        value_date=normalised_record_usd.payment.value_date + timedelta(days=5),
        amount=normalised_record_usd.amount_myr_at_settlement_rate,
    )
    score = _score(normalised_record_usd, entry, _settings(date_window_days=5))
    assert score.date_proximity_score == 0.0
