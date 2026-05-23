"""FX tool wrappers."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.services.fx_service import FXService, StaticFallbackProvider
from app.tools.fx_tools import FX_TOOL_SCHEMAS, get_fx_rate, get_rates_for_dates


@pytest.mark.asyncio
async def test_get_fx_rate_via_service():
    svc = FXService(providers=[StaticFallbackProvider()])
    rate = await get_fx_rate(svc, "USD", "MYR", date(2026, 5, 18))
    assert rate > Decimal("3")


@pytest.mark.asyncio
async def test_get_rates_for_dates_batch():
    svc = FXService(providers=[StaticFallbackProvider()])
    rates = await get_rates_for_dates(
        svc, "USD", "MYR", [date(2026, 5, 18), date(2026, 5, 20)]
    )
    assert len(rates) == 2


def test_tool_schema_shape():
    assert FX_TOOL_SCHEMAS[0]["name"] == "get_fx_rate"
    assert "input_schema" in FX_TOOL_SCHEMAS[0]
