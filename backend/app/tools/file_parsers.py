"""Parsers for structured payment artefacts and bank statements.

Vision-first extraction lives in the LLM client. These parsers are the
fallback / structured-input path for PDFs, Excel exports, and CSVs.
"""

from __future__ import annotations

import csv
import io
import re
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
    """Return concatenated text from all pages of a PDF.

    Falls back to raw UTF-8 decode if pdfplumber cannot open the file, so
    callers can still pass text-like bytes (test fixtures, embedded-text PDFs)
    to the LLM path.
    """
    chunks: list[str] = []
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                if text:
                    chunks.append(text)
    except Exception:
        return data.decode("utf-8-sig", errors="replace").strip()
    return "\n\n".join(chunks)


def detect_image_media_type(data: bytes, filename: str = "") -> str:
    """Sniff image MIME type from magic bytes; fall back to filename extension."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    lower = filename.lower()
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith(".png"):
        return "image/png"
    return "image/jpeg"


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


_DATE_KEYS = {"date", "value date", "valuedate", "posting date", "transaction date", "txn date", "tarikh"}
_WITHDRAWAL_KEYS = {"withdrawal", "pengeluaran", "debit", "money out", "withdrawals"}
_DEPOSIT_KEYS = {"deposit", "deposits", "credit", "money in", "credits"}
_BALANCE_KEYS = {"balance", "baki", "running balance"}
_AMOUNT_KEYS = {"amount", "amount (myr)", "amount myr"}
_DESC_KEYS = {"description", "narrative", "details", "particulars", "diskripsi"}
_REF_KEYS = {"reference", "ref", "reference no", "ref no", "txn ref", "no. rujukan", "rujukan"}
_COUNTERPARTY_KEYS = {"counterparty", "payer", "remitter", "sender"}

_DEBIT_DESC_RE = re.compile(
    r"\b(POS DEBIT|DEBIT|WITHDRAWAL|DUITNOW TO|PAYMENT TO|TRANSFER TO|FUND TRANSFER TO|CHARGE|FEE)\b",
    re.IGNORECASE,
)
_CREDIT_DESC_RE = re.compile(
    r"\b(CREDIT|DEPOSIT|DUITNOW FROM|TRANSFER FROM|INWARD|RECEIVED|PROFIT|HIBAH|INTEREST|SALARY)\b",
    re.IGNORECASE,
)
_SKIP_DESC_RE = re.compile(r"\b(OPENING BALANCE|CLOSING BALANCE|BAKI PENUTUP)\b", re.IGNORECASE)


def _header_tokens(header: str) -> set[str]:
    """Split multi-line PDF table headers into matchable tokens."""
    parts = re.split(r"[\n/\(\)\[\]]+", str(header).lower())
    return {p.strip() for p in parts if p.strip()}


def _pick(row: dict[str, Any], keys: set[str]) -> Any:
    for k, v in row.items():
        if k is None:
            continue
        if k.strip().lower() in keys or _header_tokens(k) & keys:
            return v
    return None


def _find_column_value(row: dict[str, Any], *needles: str) -> Any:
    for k, v in row.items():
        if k is None:
            continue
        tokens = _header_tokens(k)
        if any(n.lower() in tokens or n.lower() in str(k).lower() for n in needles):
            return v
    return None


def _resolve_entry_amount(row: dict[str, Any], description: str = "") -> Decimal | None:
    """Derive signed transaction amount from withdrawal/deposit columns.

    Malaysian bank PDFs (e.g. CIMB) expose separate Withdrawal, Deposit, and
    Balance columns. The balance must never be stored as the transaction amount.
    Withdrawals are negative; deposits/credits are positive.
    """
    desc = description or str(_find_column_value(row, "description", "diskripsi", "particulars") or "")
    if _SKIP_DESC_RE.search(desc):
        return None

    withdrawal = _to_decimal(_find_column_value(row, "withdrawal", "pengeluaran", "debit"))
    deposit = _to_decimal(_find_column_value(row, "deposit", "deposits", "credit"))
    single_amount = _to_decimal(_find_column_value(row, "amount"))

    outgoing = bool(_DEBIT_DESC_RE.search(desc))
    incoming = bool(_CREDIT_DESC_RE.search(desc))

    if withdrawal is not None and withdrawal > 0:
        return -abs(withdrawal)
    if deposit is not None and deposit > 0:
        # Some PDF table extractions mis-place outgoing transfers in the deposit column.
        if outgoing and not incoming:
            return -abs(deposit)
        return abs(deposit)
    if single_amount is not None:
        if outgoing and not incoming and single_amount > 0:
            return -abs(single_amount)
        if incoming and not outgoing and single_amount < 0:
            return abs(single_amount)
        return single_amount
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


def parse_bank_statement_text(text: str, base_currency: str = "MYR") -> BankStatement:
    """Parse CSV-shaped or line-oriented text extracted from PDFs."""
    return _parse_bank_statement_from_text(text, base_currency)


def parse_bank_statement_pdf(data: bytes, base_currency: str = "MYR") -> BankStatement:
    """Extract tabular bank rows from PDF via pdfplumber tables and text heuristics."""
    table_rows: list[dict[str, Any]] = []
    text_chunks: list[str] = []

    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                if text:
                    text_chunks.append(text)
                for table in page.extract_tables() or []:
                    if not table or len(table) < 2:
                        continue
                    headers = [str(c or "").strip() for c in table[0]]
                    if not any(headers):
                        continue
                    for row in table[1:]:
                        if not row or not any(cell not in (None, "") for cell in row):
                            continue
                        padded = list(row) + [None] * max(0, len(headers) - len(row))
                        table_rows.append(dict(zip(headers, padded[: len(headers)])))
    except Exception:
        # pdfplumber couldn't open the file — not a valid PDF.
        # Return empty so the caller can escalate to the LLM document-block path.
        return BankStatement(base_currency=base_currency)

    stmt = _build_statement(table_rows, base_currency)
    if stmt.entries:
        return stmt

    combined_text = "\n".join(text_chunks)
    return _parse_bank_statement_from_text(combined_text, base_currency=base_currency)


def _parse_bank_statement_from_text(text: str, base_currency: str = "MYR") -> BankStatement:
    """Parse extracted PDF/statement text with column-aware block heuristics."""
    stripped = text.strip()
    if not stripped:
        return BankStatement(base_currency=base_currency)

    if "," in stripped.splitlines()[0].lower():
        reader = csv.DictReader(io.StringIO(stripped))
        stmt = _build_statement(list(reader), base_currency)
        if stmt.entries:
            return stmt

    block_rows = _parse_pdf_transaction_blocks(stripped)
    if block_rows:
        return _build_statement(block_rows, base_currency)

    return _build_statement(_parse_pdf_text_lines(stripped), base_currency)


_DATE_LINE_RE = re.compile(
    r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b",
    re.IGNORECASE,
)
_DATE_START_RE = re.compile(r"^(\d{1,2}/\d{1,2}/\d{4})")
_AMOUNT_LINE_RE = re.compile(r"(?<!\d)(-?\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})(?!\d)")
_TRAILING_TXN_RE = re.compile(
    r"^(?:T(?P<ref>\d+)\s+)?(?P<txn>\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})\s+"
    r"(?P<balance>\d{1,3}(?:,\d{3})*\.\d{2}|\d+\.\d{2})\s*$"
)
_SKIP_LINE_RE = re.compile(
    r"^(Page /|Statement Date|Account No|MM/S |Important Notice|You can transfer|"
    r"Date$|Tarikh$|Description$|Withdrawal$|Deposits$|Balance$|Tax$|Ref No$|"
    r"CIMB |Savings Account|Protected by PIDM|\*\*\*)",
    re.IGNORECASE,
)


def _parse_pdf_transaction_blocks(text: str) -> list[dict[str, Any]]:
    """Group multi-line PDF rows (CIMB-style) into structured transaction dicts."""
    lines = [" ".join(line.split()) for line in text.splitlines()]
    lines = [line for line in lines if line and not _SKIP_LINE_RE.match(line)]

    blocks: list[list[str]] = []
    current: list[str] = []
    for line in lines:
        if _SKIP_DESC_RE.search(line):
            if current:
                blocks.append(current)
                current = []
            continue
        if _DATE_START_RE.match(line):
            if current:
                blocks.append(current)
            current = [line]
        elif current:
            current.append(line)
        elif line.upper().startswith("OPENING BALANCE"):
            continue
    if current:
        blocks.append(current)

    rows: list[dict[str, Any]] = []
    for block in blocks:
        parsed = _parse_transaction_block(block)
        if parsed:
            rows.append(parsed)
    return rows


def _parse_transaction_block(block: list[str]) -> dict[str, Any] | None:
    first = block[0]
    date_match = _DATE_START_RE.match(first)
    if not date_match:
        return None

    full_text = " ".join(block)
    if _SKIP_DESC_RE.search(full_text):
        return None

    value_date = date_match.group(1)
    ref: str | None = None
    withdrawal: Decimal | None = None
    deposit: Decimal | None = None
    balance: Decimal | None = None

    last = block[-1]
    tail = _TRAILING_TXN_RE.match(last)
    if tail and len(block) > 1:
        ref = f"T{tail.group('ref')}" if tail.group("ref") else None
        txn = _to_decimal(tail.group("txn"))
        balance = _to_decimal(tail.group("balance"))
        if txn is None:
            return None
        if _DEBIT_DESC_RE.search(full_text):
            withdrawal = abs(txn)
        elif _CREDIT_DESC_RE.search(full_text):
            deposit = abs(txn)
        else:
            withdrawal = abs(txn)
    else:
        amounts = [_to_decimal(a) for a in _AMOUNT_LINE_RE.findall(first)]
        amounts = [a for a in amounts if a is not None]
        if len(amounts) >= 2:
            txn, balance = amounts[-2], amounts[-1]
            if _CREDIT_DESC_RE.search(full_text):
                deposit = abs(txn)
            elif _DEBIT_DESC_RE.search(full_text):
                withdrawal = abs(txn)
            else:
                deposit = abs(txn)
        elif len(amounts) == 1:
            deposit = abs(amounts[0])
        else:
            return None

    row: dict[str, Any] = {
        "Date": value_date,
        "Description": full_text,
        "Reference": ref,
    }
    if withdrawal is not None:
        row["Withdrawal"] = str(withdrawal)
    if deposit is not None:
        row["Deposits"] = str(deposit)
    if balance is not None:
        row["Balance"] = str(balance)
    return row


def _parse_pdf_text_lines(text: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line in text.splitlines():
        cleaned = " ".join(line.split())
        if not cleaned or _SKIP_DESC_RE.search(cleaned):
            continue
        date_match = _DATE_LINE_RE.search(cleaned)
        amounts = _AMOUNT_LINE_RE.findall(cleaned)
        if not date_match or len(amounts) < 2:
            continue
        txn_raw = amounts[-2]
        row = {
            "Date": date_match.group(1),
            "Description": cleaned,
        }
        if _CREDIT_DESC_RE.search(cleaned):
            row["Deposits"] = txn_raw
        elif _DEBIT_DESC_RE.search(cleaned):
            row["Withdrawal"] = txn_raw
        else:
            row["Deposits"] = txn_raw
        if len(amounts) >= 2:
            row["Balance"] = amounts[-1]
        rows.append(row)
    return rows


def _build_statement(rows: list[dict[str, Any]], base_currency: str) -> BankStatement:
    entries: list[BankEntry] = []
    dates: list[date] = []
    for raw in rows:
        desc = str(_find_column_value(raw, "description", "diskripsi", "particulars") or _pick(raw, _DESC_KEYS) or "")
        if _SKIP_DESC_RE.search(desc):
            continue
        d = _to_date(_find_column_value(raw, "date", "tarikh") or _pick(raw, _DATE_KEYS))
        amt = _resolve_entry_amount(raw, desc)
        if d is None or amt is None:
            continue
        dates.append(d)
        ref_val = _find_column_value(raw, "reference", "ref", "rujukan") or _pick(raw, _REF_KEYS)
        entries.append(
            BankEntry(
                value_date=d,
                amount=amt,
                currency=base_currency,
                description=desc,
                reference=str(ref_val) if ref_val else None,
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


def bank_statement_from_llm_payload(payload: dict[str, Any], base_currency: str) -> BankStatement:
    """Convert LLM JSON output into a validated ``BankStatement``."""
    entries: list[BankEntry] = []
    dates: list[date] = []
    for row in payload.get("entries", []):
        value_date = _to_date(row.get("value_date"))
        amount = _to_decimal(row.get("amount"))
        if value_date is None or amount is None:
            continue
        dates.append(value_date)
        currency = str(row.get("currency") or base_currency).upper()
        entries.append(
            BankEntry(
                value_date=value_date,
                amount=amount,
                currency=currency,
                description=str(row.get("description") or ""),
                reference=str(row["reference"]) if row.get("reference") else None,
                counterparty=str(row["counterparty"]) if row.get("counterparty") else None,
                raw_row=row,
            )
        )
    return BankStatement(
        base_currency=base_currency,
        entries=entries,
        statement_period_start=min(dates) if dates else None,
        statement_period_end=max(dates) if dates else None,
    )
