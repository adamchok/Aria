"""MCP-style tool wrapping SWIFT charge estimation."""

from __future__ import annotations

from decimal import Decimal

from app.services.swift_charges import estimate_swift_charges


def estimate_swift_charges_tool(amount: Decimal, source_currency: str) -> Decimal:
    return estimate_swift_charges(amount, source_currency)


SWIFT_TOOL_SCHEMAS = [
    {
        "name": "estimate_swift_charges",
        "description": "Estimate correspondent-bank charges in source currency for a given amount and corridor.",
        "input_schema": {
            "type": "object",
            "properties": {
                "amount": {"type": "string", "description": "Decimal as string"},
                "source_currency": {"type": "string"},
            },
            "required": ["amount", "source_currency"],
        },
    }
]
