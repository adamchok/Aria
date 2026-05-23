"""Parsers for structured payment artefacts and bank statements.

Vision-first extraction lives in the LLM client. These parsers are the
fallback / structured-input path for PDFs, Excel exports, and CSVs.
"""

from __future__ import annotations

import csv
import io
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

import openpyxl
import pdfplumber
from PIL import Image

from app.models.enums import SourceFormat
from app.models.schemas import BankEntry, BankStatement


def detect_source_format(filename: str, content_type: str | None = None) -> SourceFormat:
    name = filename.lower()
    ct = (content_type or "").lower()
    if name.endswith((".png", ".jpg", ".jpeg", ".webp")) or ct.startswith("image/"):
        return SourceFormat.IMAGE
    if name.endswith(".pdf") or ct == "application/pdf":
        return SourceFormat.PDF
    if name.endswith((".xlsx", ".xlsm")):
        return SourceFormat.EXCEL
    if name.endswith(".csv") or ct == "text/csv":
        return SourceFormat.CSV
    # Default to image — vision-first per spec.
    return SourceFormat.IMAGE


def extract_pdf_text(data: bytes) -> str:
    """Return concatenated text from all pages of a PDF."""
    chunks: list[str] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            if text:
                chunks.append(text)
    return "\n\n".join(chunks)


def preprocess_image(data: bytes, max_side: int = 2000) -> bytes:
    """Downscale large images to keep token usage bounded. Returns JPEG bytes."""
    img = Image.open(io.BytesIO(data))
    img = img.convert("RGB")
    w, h = img.size
    if max(w, h) > max_side:
        scale = max_side / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88, optimize=True)
    return buf.getvalue()


def _to_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float)):
        return Decimal(str(value))
    try:
        cleaned = str(value).replace(",", "").replace(" ", "").strip()
        if cleaned.startswith("(") and cleaned.endswith(")"):
            cleaned = "-" + cleaned[1:-1]
        return Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return None


def _to_date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


_DATE_KEYS = {"date", "value date", "valuedate", "posting date", "transaction date", "txn date"}
_AMOUNT_KEYS = {"amount", "credit", "credit amount", "amount (myr)", "amount myr"}
_DESC_KEYS = {"description", "narrative", "details", "particulars"}
_REF_KEYS = {"reference", "ref", "reference no", "ref no", "txn ref"}
_COUNTERPARTY_KEYS = {"counterparty", "payer", "remitter", "sender"}


def _pick(row: dict[str, Any], keys: set[str]) -> Any:
    for k, v in row.items():
        if k is None:
            continue
        if k.strip().lower() in keys:
            return v
    return None


def parse_bank_statement_excel(data: bytes, base_currency: str = "MYR") -> BankStatement:
    wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
    ws = wb.active
    if ws is None:
        return BankStatement(base_currency=base_currency)
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return BankStatement(base_currency=base_currency)
    headers = [str(c).strip() if c is not None else "" for c in rows[0]]
    return _build_statement([dict(zip(headers, r)) for r in rows[1:]], base_currency)


def parse_bank_statement_csv(data: bytes, base_currency: str = "MYR") -> BankStatement:
    text = data.decode("utf-8-sig", errors="replace")
    reader = csv.DictReader(io.StringIO(text))
    return _build_statement(list(reader), base_currency)


def _build_statement(rows: list[dict[str, Any]], base_currency: str) -> BankStatement:
    entries: list[BankEntry] = []
    dates: list[date] = []
    for raw in rows:
        d = _to_date(_pick(raw, _DATE_KEYS))
        amt = _to_decimal(_pick(raw, _AMOUNT_KEYS))
        if d is None or amt is None:
            continue
        dates.append(d)
        entries.append(
            BankEntry(
                value_date=d,
                amount=amt,
                currency=base_currency,
                description=str(_pick(raw, _DESC_KEYS) or ""),
                reference=str(_pick(raw, _REF_KEYS)) if _pick(raw, _REF_KEYS) else None,
                counterparty=str(_pick(raw, _COUNTERPARTY_KEYS))
                if _pick(raw, _COUNTERPARTY_KEYS)
                else None,
                raw_row={k: (v if not isinstance(v, datetime) else v.isoformat()) for k, v in raw.items()},
            )
        )
    return BankStatement(
        base_currency=base_currency,
        entries=entries,
        statement_period_start=min(dates) if dates else None,
        statement_period_end=max(dates) if dates else None,
    )
