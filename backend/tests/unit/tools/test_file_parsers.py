"""File-parser tests for bank statements and source-format detection."""

from __future__ import annotations

import io
from datetime import date
from decimal import Decimal
from pathlib import Path

import openpyxl

from app.models.enums import SourceFormat
from app.tools.file_parsers import (
    detect_image_media_type,
    detect_source_format,
    parse_bank_statement_csv,
    parse_bank_statement_excel,
    parse_bank_statement_text,
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


def test_parse_bank_statement_text_from_csv_shape():
    text = (
        "Date,Amount,Description,Reference,Counterparty\n"
        "2026-05-20,4179.24,Inward TT,INV-001,ACME US INC\n"
    )
    stmt = parse_bank_statement_text(text)
    assert len(stmt.entries) == 1
    assert stmt.entries[0].amount == Decimal("4179.24")
    assert stmt.entries[0].reference == "INV-001"


def test_parse_bank_statement_text_from_freeform_lines():
    text = "2026-05-20 4179.24 4200.00 Inward Telegraphic Transfer INV-001 ACME US INC"
    stmt = parse_bank_statement_text(text)
    assert len(stmt.entries) == 1
    assert stmt.entries[0].value_date == date(2026, 5, 20)
    assert stmt.entries[0].amount == Decimal("4179.24")


def test_parse_cimb_pdf_withdrawal_deposit_balance_columns():
    from pathlib import Path

    from app.tools.file_parsers import parse_bank_statement_pdf

    data = Path(__file__).resolve().parents[2] / "fixtures/bank_statements/cimb_savings_apr2026.pdf"
    stmt = parse_bank_statement_pdf(data.read_bytes(), base_currency="MYR")
    assert len(stmt.entries) == 6

    pos_debit = next(e for e in stmt.entries if "POS DEBIT" in e.description and "GRAMMARLY" in e.description)
    assert pos_debit.amount == Decimal("-242.36")
    assert pos_debit.reference == "T89545"

    duitnow = next(e for e in stmt.entries if "DUITNOW TO ACCOUNT" in e.description)
    assert duitnow.amount == Decimal("-200.00")

    credit = next(e for e in stmt.entries if "CREDIT PROFIT/HIBAH" in e.description)
    assert credit.amount == Decimal("0.06")

    # Balances must not appear as transaction amounts.
    assert all(e.amount not in {Decimal("85.33"), Decimal("144.01"), Decimal("244.93")} for e in stmt.entries)


def test_parse_cimb_text_blocks_when_table_missing():
    text = """
24/04/2026 POS DEBIT
GRAMMARLY CO SAN FAN
T89545 242.36 85.33
30/04/2026 CREDIT PROFIT/HIBAH 0.06 144.01
CLOSING BALANCE 144.01
"""
    stmt = parse_bank_statement_text(text)
    assert len(stmt.entries) == 2
    assert stmt.entries[0].amount == Decimal("-242.36")
    assert stmt.entries[1].amount == Decimal("0.06")


def test_preprocess_image_returns_jpeg():
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (4000, 3000), color=(255, 255, 255)).save(buf, format="PNG")
    out = preprocess_image(buf.getvalue())
    img = Image.open(io.BytesIO(out))
    assert img.format == "JPEG"
    assert max(img.size) <= 2000


def test_detect_image_media_type_from_bytes_not_filename():
    from PIL import Image

    png_buf = io.BytesIO()
    Image.new("RGB", (10, 10), color=(0, 0, 0)).save(png_buf, format="PNG")
    assert detect_image_media_type(png_buf.getvalue(), "receipt.png") == "image/png"

    jpeg_out = preprocess_image(png_buf.getvalue())
    # Preprocess re-encodes as JPEG; filename may still say .png.
    assert detect_image_media_type(jpeg_out, "receipt.png") == "image/jpeg"
