"""MCP-style FX tool wrappers used by the normalisation agent."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.services.fx_service import FXService


async def get_fx_rate(
    fx_service: FXService,
    source_currency: str,
    target_currency: str,
    on_date: date,
) -> Decimal:
    """Return the FX rate from ``source_currency`` to ``target_currency`` on ``on_date``."""
    return await fx_service.get_rate(source_currency, target_currency, on_date)


async def get_rates_for_dates(
    fx_service: FXService,
    source_currency: str,
    target_currency: str,
    dates: list[date],
) -> dict[date, Decimal]:
    """Batch-fetch rates. Used by Agent 2 for invoice + settlement dates."""
    result: dict[date, Decimal] = {}
    for d in dates:
        result[d] = await fx_service.get_rate(source_currency, target_currency, d)
    return result


# Tool schema (MCP-compatible). Agents may invoke via this schema rather than
# calling the function directly.
FX_TOOL_SCHEMAS = [
    {
        "name": "get_fx_rate",
        "description": "Return the daily FX rate from source_currency to target_currency on a date.",
        "input_schema": {
            "type": "object",
            "properties": {
                "source_currency": {"type": "string", "description": "ISO 4217"},
                "target_currency": {"type": "string", "description": "ISO 4217"},
                "on_date": {"type": "string", "format": "date"},
            },
            "required": ["source_currency", "target_currency", "on_date"],
        },
    }
]
