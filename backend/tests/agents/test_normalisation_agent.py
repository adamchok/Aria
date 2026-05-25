"""Normalisation stage tests."""

from __future__ import annotations

import pytest

from app.agents.sdk.context import ReconciliationContext
from app.agents.sdk.stages.normalisation import _add_business_days, run_normalisation_stage
from app.core.config import Settings
from app.graph.state import ReconciliationState
from app.models.schemas import PaymentRecord
from app.services.fx_service import FXService
from datetime import date
from decimal import Decimal
from uuid import uuid4
from app.models.enums import SourceFormat


@pytest.mark.asyncio
async def test_normalisation_produces_myr_amounts(payment_record_usd):
    state = ReconciliationState(job_id=uuid4(), payment_records=[payment_record_usd])
    ctx = ReconciliationContext(state=state, settings=Settings(_env_file=None))
    fx = FXService(settings=Settings(_env_file=None))
    await run_normalisation_stage(ctx, fx_service=fx)
    assert len(state.normalised_records) == 1
    nr = state.normalised_records[0]
    assert nr.amount_myr_at_invoice_rate > Decimal("0")
    assert nr.tolerance_low <= nr.tolerance_high


@pytest.mark.asyncio
async def test_normalisation_skips_on_fx_failure(monkeypatch):
    rec = PaymentRecord(
        payer="A",
        payee="B",
        amount_original=Decimal("100"),
        currency="XXX",
        value_date=date(2026, 5, 1),
        source_format=SourceFormat.IMAGE,
        extraction_confidence=0.9,
    )
    state = ReconciliationState(job_id=uuid4(), payment_records=[rec])

    class _FailFX(FXService):
        async def get_rate(self, *args, **kwargs):
            from app.core.exceptions import FXRateUnavailableError

            raise FXRateUnavailableError("no rate")

    ctx = ReconciliationContext(state=state, settings=Settings(_env_file=None))
    await run_normalisation_stage(ctx, fx_service=_FailFX(settings=Settings(_env_file=None)))
    assert len(state.normalised_records) == 1
    assert state.normalised_records[0].fx_unavailable is True
    assert any(e.action == "fx_unavailable" for e in state.audit_log)


def test_add_business_days_skips_weekends():
    assert _add_business_days(date(2026, 5, 15), 2) == date(2026, 5, 19)
