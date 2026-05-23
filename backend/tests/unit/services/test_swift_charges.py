"""SWIFT charge estimator."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.services.swift_charges import estimate_swift_charges


@pytest.mark.parametrize(
    "amount, currency, expected_lo, expected_hi",
    [
        (Decimal("100"), "USD", Decimal("12"), Decimal("12")),
        (Decimal("50000"), "USD", Decimal("28"), Decimal("28")),
        (Decimal("100"), "EUR", Decimal("10"), Decimal("10")),
        (Decimal("50000"), "GBP", Decimal("30"), Decimal("30")),
        (Decimal("100"), "MYR", Decimal("0"), Decimal("0")),
        (Decimal("100"), "JPY", Decimal("0"), Decimal("0")),  # unknown corridor
    ],
)
def test_estimate_known_and_unknown(amount, currency, expected_lo, expected_hi):
    result = estimate_swift_charges(amount, currency)
    assert result == expected_lo == expected_hi
