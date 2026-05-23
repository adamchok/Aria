"""SWIFT tool wrapper."""

from __future__ import annotations

from decimal import Decimal

from app.tools.swift_tools import SWIFT_TOOL_SCHEMAS, estimate_swift_charges_tool


def test_tool_returns_decimal():
    assert estimate_swift_charges_tool(Decimal("100"), "USD") == Decimal("12")


def test_schema_shape():
    assert SWIFT_TOOL_SCHEMAS[0]["name"] == "estimate_swift_charges"
