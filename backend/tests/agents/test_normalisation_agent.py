"""Agent 2 — Normalisation."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from app.agents.normalisation import NormalisationAgent, _add_business_days
from app.core.config import Settings
from app.graph.state import ReconciliationState
from app.models.enums import SourceFormat
from app.models.schemas import PaymentRecord
from app.services.fx_service import FXService, StaticFallbackProvider


def _make_state(records):
    return ReconciliationState(job_id=uuid4(), payment_records=records, base_currency="MYR")


@pytest.mark.asyncio
async def test_normalisation_computes_tolerance_window(payment_record_usd):
    state = _make_state([payment_record_usd])
    agent = NormalisationAgent(
        fx_service=FXService(providers=[StaticFallbackProvider()]),
        settings=Settings(_env_file=None),
    )
    out = await agent.arun(state)
    assert len(out.normalised_records) == 1
    nr = out.normalised_records[0]
    assert nr.tolerance_low <= nr.tolerance_high
    assert nr.amount_myr_at_invoice_rate > Decimal("30")
    assert nr.estimated_charges_myr > Decimal("0")
    # Buffer of 1.5% must affect tolerance bounds.
    assert nr.tolerance_high >= nr.amount_myr_at_settlement_rate


@pytest.mark.asyncio
async def test_normalisation_skips_unavailable_currency(payment_record_usd):
    # Force a currency the static fallback doesn't know.
    payment_record_usd.currency = "JPY"
    state = _make_state([payment_record_usd])
    agent = NormalisationAgent(
        fx_service=FXService(providers=[StaticFallbackProvider()]),
    )
    out = await agent.arun(state)
    assert out.normalised_records == []
    assert any(e.action == "fx_unavailable" for e in out.audit_log)


def test_business_day_addition_skips_weekend():
    # Friday May 22 + 2 business days = Tuesday May 26 (Mon 25 + Tue 26).
    assert _add_business_days(date(2026, 5, 22), 2) == date(2026, 5, 26)
