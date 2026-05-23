"""Pydantic model validation and Decimal handling."""

from __future__ import annotations

import json
from datetime import date
from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.models.enums import MatchStatus, SourceFormat
from app.models.schemas import (
    BankEntry,
    MatchResult,
    NormalisedRecord,
    PaymentRecord,
)


def test_payment_record_coerces_currency_uppercase():
    r = PaymentRecord(
        payer="A",
        payee="B",
        amount_original=Decimal("1.23"),
        currency="usd",
        value_date=date(2026, 5, 1),
        source_format=SourceFormat.IMAGE,
        extraction_confidence=0.9,
    )
    assert r.currency == "USD"


def test_payment_record_confidence_bounded():
    with pytest.raises(ValidationError):
        PaymentRecord(
            payer="A",
            payee="B",
            amount_original=Decimal("1"),
            currency="USD",
            value_date=date(2026, 5, 1),
            source_format=SourceFormat.IMAGE,
            extraction_confidence=1.5,
        )


def test_payment_record_currency_length():
    with pytest.raises(ValidationError):
        PaymentRecord(
            payer="A",
            payee="B",
            amount_original=Decimal("1"),
            currency="DOLLAR",
            value_date=date(2026, 5, 1),
            source_format=SourceFormat.IMAGE,
            extraction_confidence=0.5,
        )


def test_decimal_serialises_as_string(payment_record_usd):
    data = payment_record_usd.model_dump(mode="json")
    assert data["amount_original"] == "10.00"
    # Verify precision survives a JSON round-trip.
    parsed = json.loads(json.dumps(data))
    assert Decimal(parsed["amount_original"]) == Decimal("10.00")


def test_normalised_record_round_trip(normalised_record_usd):
    payload = normalised_record_usd.model_dump(mode="json")
    rebuilt = NormalisedRecord.model_validate(payload)
    assert rebuilt.amount_myr_at_invoice_rate == Decimal("42.30")
    assert rebuilt.tolerance_high == Decimal("43.20")
    assert rebuilt.payment.currency == "USD"


def test_match_result_status_enum(normalised_record_usd, bank_entry_myr):
    m = MatchResult(
        normalised_record=normalised_record_usd,
        bank_entry=bank_entry_myr,
        confidence=0.81,
        status=MatchStatus.MATCHED,
        amount_variance_myr=Decimal("0.05"),
        variance_explanation="FX timing",
        reasoning_chain="...",
    )
    assert m.status == MatchStatus.MATCHED
    assert m.amount_variance_myr == Decimal("0.05")
