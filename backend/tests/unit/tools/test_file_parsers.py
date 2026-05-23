"""File-parser tests for bank statements and source-format detection."""

from __future__ import annotations

import io
from datetime import date
from decimal import Decimal
from pathlib import Path

import openpyxl

from app.models.enums import SourceFormat
from app.tools.file_parsers import (
    detect_source_format,
    parse_bank_statement_csv,
    parse_bank_statement_excel,
    preprocess_image,
)


def _build_excel_bytes(rows: list[list]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_detect_source_format_by_extension():
    assert detect_source_format("a.png") == SourceFormat.IMAGE
    assert detect_source_format("a.PDF") == SourceFormat.PDF
    assert detect_source_format("statement.xlsx") == SourceFormat.EXCEL
    assert detect_source_format("statement.csv") == SourceFormat.CSV


def test_parse_bank_statement_excel():
    data = _build_excel_bytes(
        [
            ["Date", "Amount", "Description", "Reference", "Counterparty"],
            [date(2026, 5, 20), 42.30, "Telegraphic transfer", "INV-001", "ACME"],
            [date(2026, 5, 21), 100.50, "Cash deposit", None, None],
        ]
    )
    stmt = parse_bank_statement_excel(data)
    assert len(stmt.entries) == 2
    assert stmt.entries[0].amount == Decimal("42.3")
    assert stmt.entries[0].reference == "INV-001"
    assert stmt.statement_period_start == date(2026, 5, 20)


def test_parse_bank_statement_csv():
    csv_bytes = (
        b"Date,Amount,Description,Reference\n"
        b"2026-05-20,42.30,Inward TT,INV-001\n"
        b"21/05/2026,100.00,Salary,\n"
    )
    stmt = parse_bank_statement_csv(csv_bytes)
    assert len(stmt.entries) == 2
    assert stmt.entries[0].amount == Decimal("42.30")
    assert stmt.entries[1].value_date == date(2026, 5, 21)


def test_preprocess_image_returns_jpeg():
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (4000, 3000), color=(255, 255, 255)).save(buf, format="PNG")
    out = preprocess_image(buf.getvalue())
    img = Image.open(io.BytesIO(out))
    assert img.format == "JPEG"
    assert max(img.size) <= 2000
