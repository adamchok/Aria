"""SWIFT correspondent-bank charge estimator.

Per-corridor estimates based on industry averages (Pay360 2025, J.P. Morgan 2025).
These are deliberately conservative and adjustable per corridor — Agent 3 uses
the estimate inside the tolerance window, not as a hard deduction.
"""

from __future__ import annotations

from decimal import Decimal

# Estimated correspondent fee in source currency. Lower bound for amounts under
# 10k units, upper bound otherwise — SWIFT fees scale weakly with amount.
_CORRIDOR_CHARGES: dict[str, tuple[Decimal, Decimal]] = {
    "USD": (Decimal("12"), Decimal("28")),
    "EUR": (Decimal("10"), Decimal("25")),
    "GBP": (Decimal("12"), Decimal("30")),
    "SGD": (Decimal("8"), Decimal("18")),
    "MYR": (Decimal("0"), Decimal("0")),
}

_LOW_AMOUNT_THRESHOLD = Decimal("10000")


def estimate_swift_charges(amount: Decimal, source_currency: str) -> Decimal:
    """Return estimated SWIFT/correspondent deduction in `source_currency`.

    Returns ``Decimal("0")`` for unknown corridors — Agent 3 should treat this
    as "no estimate" rather than "no fee".
    """
    low, high = _CORRIDOR_CHARGES.get(source_currency.upper(), (Decimal("0"), Decimal("0")))
    if amount < _LOW_AMOUNT_THRESHOLD:
        return low
    return high
