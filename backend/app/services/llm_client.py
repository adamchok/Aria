"""LLM client with mock/live toggle.

In ``mock`` mode the client returns deterministic, schema-shaped responses
synthesised from the input. This lets the full pipeline run end-to-end in
CI and locally without burning credits. In ``live`` mode the same surface
delegates to the Anthropic SDK.

The surface intentionally mirrors what each agent needs rather than the raw
Anthropic API — agents call ``extract_payment_record``, ``reason_match``,
etc., not ``messages.create``. This keeps the prompt + parsing logic
testable, and the mock path obvious.
"""

from __future__ import annotations

import json
import re
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from app.core.config import Settings, get_settings
from app.core.exceptions import LLMError
from app.core.logging import get_logger
from app.models.enums import SourceFormat
from app.tools.file_parsers import detect_image_media_type

logger = get_logger(__name__)


def _parse_json_block(text: str) -> dict[str, Any]:
    """Best-effort extract of a JSON object from LLM output."""
    # Strip ```json fences if present
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    # Otherwise take the first {...} balanced object.
    start = text.find("{")
    if start == -1:
        raise LLMError("No JSON object in LLM response")
    depth = 0
    for i, ch in enumerate(text[start:], start=start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except json.JSONDecodeError as exc:
                    raise LLMError(f"Malformed JSON in LLM response: {exc}") from exc
    raise LLMError("Unbalanced JSON in LLM response")


class LLMClient:
    """Thin abstraction over Anthropic + a deterministic mock backend."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._anthropic: Any = None

    @property
    def mode(self) -> str:
        return self._settings.llm_mode

    def _get_anthropic(self) -> Any:
        if self._anthropic is None:
            try:
                from anthropic import Anthropic  # local import — optional dep at runtime
            except ImportError as exc:  # pragma: no cover
                raise LLMError("anthropic package not installed") from exc
            self._anthropic = Anthropic(api_key=self._settings.anthropic_api_key)
        return self._anthropic

    # ─── Agent 1: ingestion ──────────────────────────────────────────────

    def extract_payment_record(
        self,
        *,
        document_bytes: bytes,
        filename: str,
        source_format: SourceFormat,
        text_hint: str | None = None,
    ) -> dict[str, Any]:
        """Return a dict matching ``PaymentRecord`` (without id/source_format)."""
        if self._settings.llm_mode == "mock":
            return _mock_extraction(filename=filename, text_hint=text_hint)

        # Route model by source format:
        #   IMAGE  → Opus 4.7 (3× image resolution — critical for WhatsApp screenshots / SWIFT scans)
        #   EXCEL/CSV → Haiku 4.5 (structured text only; 3× cheaper than Sonnet, no vision needed)
        #   PDF    → Sonnet 4.6 (text extraction via pdfplumber; good doc comprehension)
        if source_format == SourceFormat.IMAGE:
            model = self._settings.opus_model
        elif source_format in {SourceFormat.EXCEL, SourceFormat.CSV}:
            model = self._settings.haiku_model
        else:
            model = self._settings.sonnet_model

        client = self._get_anthropic()
        content: list[dict[str, Any]] = []

        import base64
        if source_format == SourceFormat.IMAGE:
            content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": detect_image_media_type(document_bytes, filename),
                        "data": base64.b64encode(document_bytes).decode(),
                    },
                }
            )
        elif source_format == SourceFormat.PDF:
            # Send raw PDF bytes as a native document block — Claude renders each page
            # internally, preserving layout and table structure that pdfplumber misses.
            content.append(
                {
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": "application/pdf",
                        "data": base64.b64encode(document_bytes).decode(),
                    },
                }
            )
            if text_hint:
                content.append({"type": "text", "text": f"Extracted text hint:\n{text_hint[:5_000]}"})
        else:
            # EXCEL / CSV: structured text only
            content.append(
                {
                    "type": "text",
                    "text": (text_hint or document_bytes.decode("utf-8", errors="replace"))[:40_000],
                }
            )

        # Extraction instructions in system with cache_control — cached across all calls
        # in a batch job (same prompt, different documents → 90% input token saving).
        try:
            resp = client.messages.create(
                model=model,
                max_tokens=2048,
                system=[{"type": "text", "text": _EXTRACTION_PROMPT, "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": content}],
            )
        except Exception as exc:
            raise LLMError(f"Anthropic extract call failed: {exc}") from exc

        text = "".join(block.text for block in resp.content if getattr(block, "type", "") == "text")
        return _parse_json_block(text)

    # ─── Agent 3: matching reasoning ─────────────────────────────────────

    def reason_match(
        self,
        *,
        normalised: dict[str, Any],
        candidate: dict[str, Any] | None,
        candidate_scores: dict[str, Any],
    ) -> dict[str, Any]:
        """Return ``{confidence, status, amount_variance_myr, variance_explanation,
        reasoning_chain}`` — see schemas.MatchResult."""
        if self._settings.llm_mode == "mock":
            return _mock_match_reasoning(normalised, candidate, candidate_scores)

        # Sonnet with adaptive thinking on first pass.
        result = self._reason_match_with_model(
            self._settings.sonnet_model,
            normalised=normalised,
            candidate=candidate,
            candidate_scores=candidate_scores,
        )

        # Border zone (0.45–0.65): escalate to Opus 4.7.
        # Opus self-verifies its match decision, converting some uncertain items to
        # confirmed matches and reducing human escalation rate.
        confidence = float(result.get("confidence", 0.0))
        if 0.45 <= confidence <= 0.65:
            logger.info("match.escalating_to_opus", confidence=round(confidence, 3))
            result = self._reason_match_with_model(
                self._settings.opus_model,
                normalised=normalised,
                candidate=candidate,
                candidate_scores=candidate_scores,
            )

        return result

    def _reason_match_with_model(
        self,
        model: str,
        *,
        normalised: dict[str, Any],
        candidate: dict[str, Any] | None,
        candidate_scores: dict[str, Any],
    ) -> dict[str, Any]:
        client = self._get_anthropic()
        prompt = _MATCHING_PROMPT.format(
            normalised=json.dumps(normalised, default=str),
            candidate=json.dumps(candidate, default=str) if candidate else "null",
            scores=json.dumps(candidate_scores, default=str),
        )
        try:
            resp = client.messages.create(
                model=model,
                max_tokens=8000,
                thinking={"type": "adaptive"},
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as exc:
            raise LLMError(f"Anthropic match call failed: {exc}") from exc
        text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        return _parse_json_block(text)

    # ─── Bank statement extraction (PDF fallback) ────────────────────────

    def extract_bank_statement(
        self,
        *,
        text_hint: str,
        filename: str,
        base_currency: str,
        pdf_bytes: bytes | None = None,
    ) -> dict[str, Any]:
        """Return ``{entries: [{value_date, amount, currency, ...}]}``.

        When ``pdf_bytes`` is provided the raw PDF is sent as a native document
        block to Sonnet 4.6 which renders pages internally — this recovers tables
        that pdfplumber mis-parses or misses entirely.  Falls back to Haiku 4.5
        with text only when no PDF bytes are available.
        """
        if self._settings.llm_mode == "mock":
            return _mock_bank_statement(
                text_hint=text_hint, filename=filename, base_currency=base_currency
            )

        client = self._get_anthropic()

        if pdf_bytes is not None:
            import base64
            content: list[dict[str, Any]] = [
                {
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": "application/pdf",
                        "data": base64.b64encode(pdf_bytes).decode(),
                    },
                },
                {
                    "type": "text",
                    "text": _BANK_STATEMENT_PROMPT_PDF.format(
                        base_currency=base_currency, filename=filename
                    ),
                },
            ]
            try:
                resp = client.messages.create(
                    model=self._settings.sonnet_model,
                    max_tokens=4096,
                    messages=[{"role": "user", "content": content}],
                )
            except Exception as exc:
                raise LLMError(f"Anthropic bank-statement PDF call failed: {exc}") from exc
        else:
            # Haiku 4.5: structured text extraction — fast and cheap.
            prompt = _BANK_STATEMENT_PROMPT.format(
                base_currency=base_currency,
                filename=filename,
                text=text_hint[:40_000],
            )
            try:
                resp = client.messages.create(
                    model=self._settings.haiku_model,
                    max_tokens=4096,
                    messages=[{"role": "user", "content": prompt}],
                )
            except Exception as exc:
                raise LLMError(f"Anthropic bank-statement call failed: {exc}") from exc

        text = "".join(block.text for block in resp.content if getattr(block, "type", "") == "text")
        return _parse_json_block(text)

    # ─── Agent 4: report narrative ───────────────────────────────────────

    def summarise_report(self, *, summary: dict[str, Any], exceptions: list[dict[str, Any]]) -> str:
        if self._settings.llm_mode == "mock":
            return _sanitize_narrative(_mock_report_narrative(summary, exceptions))
        client = self._get_anthropic()
        prompt = _REPORT_PROMPT.format(
            summary=json.dumps(summary, default=str),
            exceptions=json.dumps(exceptions, default=str)[:8_000],
        )
        try:
            resp = client.messages.create(
                model=self._settings.sonnet_model,
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as exc:
            raise LLMError(f"Anthropic report call failed: {exc}") from exc
        raw = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()
        return _sanitize_narrative(raw)


# ─── Mock implementations ───────────────────────────────────────────────────


def _mock_extraction(*, filename: str, text_hint: str | None) -> dict[str, Any]:
    """Deterministic mock extraction.

    If ``text_hint`` looks like one of our fixture strings (``CURRENCY|AMOUNT|...``)
    we parse it; otherwise we synthesise sensible defaults from the filename
    so the pipeline can still run end-to-end on arbitrary inputs.
    """
    if text_hint and text_hint.startswith("MOCK|"):
        # MOCK|USD|10.00|2026-05-18|ACME Ltd|SME Sdn Bhd|INV-001
        parts = [p.strip() for p in text_hint.strip().split("|")]
        currency = parts[1] if len(parts) > 1 else "USD"
        amount = parts[2] if len(parts) > 2 else "100.00"
        value_date = parts[3] if len(parts) > 3 else "2026-05-18"
        payer = parts[4] if len(parts) > 4 else "Mock Payer Ltd"
        payee = parts[5] if len(parts) > 5 else "ARIA Demo SDN BHD"
        reference = parts[6] if len(parts) > 6 else "MOCK-REF"
        confidence = 0.92
    else:
        currency = "USD"
        amount = "100.00"
        value_date = date.today().isoformat()
        payer = "Acme Inc"
        payee = "ARIA Demo SDN BHD"
        reference = filename.rsplit(".", 1)[0][:16].upper()
        confidence = 0.85

    return {
        "payer": payer,
        "payee": payee,
        "amount_original": amount,
        "currency": currency,
        "value_date": value_date,
        "reference": reference,
        "bank_charges": None,
        "extraction_confidence": confidence,
        "field_confidences": {
            "amount_original": 0.95,
            "currency": 0.99,
            "value_date": 0.9,
            "reference": 0.8,
            "payer": 0.85,
        },
        "raw_extracted_text": text_hint or f"[mock extracted text for {filename}]",
    }


def _mock_bank_statement(*, text_hint: str, filename: str, base_currency: str) -> dict[str, Any]:
    """Deterministic bank-statement extraction for mock mode."""
    from app.tools.file_parsers import parse_bank_statement_text

    if text_hint:
        if text_hint.strip().startswith("MOCK|STMT|"):
            entries: list[dict[str, Any]] = []
            for line in text_hint.splitlines():
                line = line.strip()
                if not line.startswith("MOCK|STMT|"):
                    continue
                # MOCK|STMT|2026-05-20|4179.24|Inward TT|INV-001|ACME US INC
                parts = [p.strip() for p in line.split("|")]
                if len(parts) < 4:
                    continue
                entries.append(
                    {
                        "value_date": parts[2],
                        "amount": parts[3],
                        "currency": base_currency,
                        "description": parts[4] if len(parts) > 4 else "",
                        "reference": parts[5] if len(parts) > 5 else None,
                        "counterparty": parts[6] if len(parts) > 6 else None,
                    }
                )
            if entries:
                return {"entries": entries}

        parsed = parse_bank_statement_text(text_hint, base_currency=base_currency)
        if parsed.entries:
            return {
                "entries": [
                    {
                        "value_date": e.value_date.isoformat(),
                        "amount": str(e.amount),
                        "currency": e.currency,
                        "description": e.description,
                        "reference": e.reference,
                        "counterparty": e.counterparty,
                    }
                    for e in parsed.entries
                ]
            }

    # Default demo rows so PDF uploads still run end-to-end in mock mode.
    return {
        "entries": [
            {
                "value_date": "2026-05-20",
                "amount": "4179.24",
                "currency": base_currency,
                "description": "Inward Telegraphic Transfer Acme US Inc",
                "reference": "INV-001",
                "counterparty": "ACME US INC",
            },
            {
                "value_date": "2026-05-21",
                "amount": "5450.20",
                "currency": base_currency,
                "description": "Inward TT Euro Buyer GmbH",
                "reference": "INV-002",
                "counterparty": "EURO BUYER GMBH",
            },
            {
                "value_date": "2026-05-22",
                "amount": "4200.04",
                "currency": base_currency,
                "description": "SWIFT Credit GBP Customer Ltd",
                "reference": "INV-003",
                "counterparty": "GBP CUSTOMER LTD",
            },
            {
                "value_date": "2026-05-23",
                "amount": "9394.88",
                "currency": base_currency,
                "description": "FAST Transfer Singapore Client",
                "reference": "INV-004",
                "counterparty": "SG CLIENT PTE",
            },
        ]
    }


def _mock_match_reasoning(
    normalised: dict[str, Any],
    candidate: dict[str, Any] | None,
    candidate_scores: dict[str, Any],
) -> dict[str, Any]:
    if candidate is None:
        return {
            "confidence": 0.0,
            "status": "UNMATCHED",
            "amount_variance_myr": "0",
            "variance_explanation": (
                "No bank statement entry was within the date and tolerance window."
            ),
            "reasoning_chain": (
                "Mock reasoning: empty candidate set after filter stages 1 and 2 — "
                "no match possible."
            ),
        }

    composite = float(candidate_scores.get("composite", 0.7))
    tol_low = Decimal(str(normalised["tolerance_low"]))
    tol_high = Decimal(str(normalised["tolerance_high"]))
    amount = Decimal(str(candidate["amount"]))
    midpoint = (tol_low + tol_high) / Decimal("2")
    variance = (amount - midpoint).quantize(Decimal("0.01"))

    if composite >= 0.75:
        status = "MATCHED"
        explanation = (
            f"Bank entry of MYR {amount} falls inside tolerance window "
            f"[{tol_low}, {tol_high}]. Variance vs. mid-window is MYR {variance}, "
            "consistent with FX settlement timing and estimated SWIFT charges."
        )
    elif composite >= 0.5:
        status = "UNCERTAIN"
        explanation = (
            f"Bank entry of MYR {amount} sits at the edge of the tolerance window. "
            "Payer-name match is weak; referring to human review."
        )
    else:
        status = "UNMATCHED"
        explanation = "Composite confidence below review threshold; no candidate retained."

    return {
        "confidence": composite,
        "status": status,
        "amount_variance_myr": str(variance),
        "variance_explanation": explanation,
        "reasoning_chain": (
            "Mock chain-of-thought: stage-1 date filter retained the candidate within "
            f"±{_DATE_WINDOW_DAYS} days; stage-2 amount filter confirmed it fell within "
            "the FX-derived tolerance window; stage-3 composite scoring produced "
            f"{composite:.2f} from amount/date/reference/payer weights."
        ),
    }


def _sanitize_narrative(text: str) -> str:
    """Strip markdown artefacts — report copy is plain prose for finance officers."""
    cleaned = text.strip()
    cleaned = re.sub(r"\*\*(.+?)\*\*", r"\1", cleaned)
    cleaned = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"\1", cleaned)
    cleaned = re.sub(r"\^+", "", cleaned)
    cleaned = re.sub(
        r"^Reconciliation Executive Narrative\s*\n?",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    return cleaned.strip()


def _mock_report_narrative(summary: dict[str, Any], exceptions: list[dict[str, Any]]) -> str:
    matched = summary.get("matched_count", 0)
    total = summary.get("total_records", 0)
    uncertain = summary.get("uncertain_count", 0)
    unmatched = summary.get("unmatched_count", 0)
    return (
        f"ARIA reconciled {matched} of {total} payment records with high confidence. "
        f"{uncertain} item(s) were routed to human review and {unmatched} could not be "
        f"matched within the tolerance window. Total variance against bank entries was "
        f"MYR {summary.get('total_variance_myr', '0')}."
    )


# Date window used in mock reasoning text only.
_DATE_WINDOW_DAYS = 5

_EXTRACTION_PROMPT = """You are ARIA Agent 1 (Document Ingestion).

Extract structured payment data from the document above. Respond with a single
JSON object only — no prose, no markdown fences — matching this schema:

{
  "payer": str,
  "payee": str,
  "amount_original": str (decimal, e.g. "1234.56"),
  "currency": str (ISO 4217 code),
  "value_date": str (YYYY-MM-DD),
  "reference": str | null,
  "bank_charges": str | null,
  "extraction_confidence": float (0..1, overall),
  "field_confidences": { "amount_original": float, "currency": float, ... },
  "raw_extracted_text": str (key text you read from the document)
}

Set "extraction_confidence" below 0.5 if the document is unreadable or
fields cannot be identified. Set per-field confidences below 0.7 for any
field you are uncertain about.
"""

_MATCHING_PROMPT = """You are ARIA Agent 3 (Matching).

A normalised payment record and one candidate bank-statement entry are given.
Composite candidate scores are also provided.

Normalised record:
{normalised}

Candidate bank entry (may be null):
{candidate}

Candidate scores:
{scores}

Decide MATCHED, UNCERTAIN, or UNMATCHED using these rules:
- confidence >= 0.75 -> MATCHED
- 0.5 <= confidence < 0.75 -> UNCERTAIN (route to human review)
- confidence < 0.5 -> UNMATCHED

Respond with a single JSON object (no markdown fences):

{{
  "confidence": float,
  "status": "MATCHED" | "UNCERTAIN" | "UNMATCHED",
  "amount_variance_myr": str,
  "variance_explanation": str (plain language, finance audience),
  "reasoning_chain": str (your chain-of-thought, audit log)
}}
"""

_REPORT_PROMPT = """You are ARIA Agent 4 (Audit & Report).

Reconciliation summary stats:
{summary}

Exception items:
{exceptions}

Write a 4-6 sentence executive narrative for a finance officer. State counts,
total variance, and the likely cause categories (FX timing, SWIFT charges,
duplicate, partial payment). Plain language, no jargon, no apologies.
Plain text only — no markdown, no headers, no bullet lists, no **bold** markers.
"""

_BANK_STATEMENT_PROMPT_PDF = """You are ARIA Agent 1 (Document Ingestion) extracting a bank statement from the attached PDF.

Filename: {filename}
Base currency: {base_currency}

Examine every page and extract all credit/deposit transaction rows you can identify.
Respond with a single JSON object only — no prose, no markdown fences:

{{
  "entries": [
    {{
      "value_date": "YYYY-MM-DD",
      "amount": "1234.56",
      "currency": "{base_currency}",
      "description": str,
      "reference": str | null,
      "counterparty": str | null
    }}
  ]
}}

Use positive decimal strings for credit amounts. Skip header/footer/balance/debit rows.
If no rows can be identified, return {{"entries": []}}.
"""

_BANK_STATEMENT_PROMPT = """You are ARIA Agent 1 (Document Ingestion) extracting a bank statement.

Filename: {filename}
Base currency: {base_currency}

Statement text:
{text}

Extract every credit/deposit transaction row you can identify. Respond with a
single JSON object only — no prose, no markdown fences:

{{
  "entries": [
    {{
      "value_date": "YYYY-MM-DD",
      "amount": "1234.56",
      "currency": "{base_currency}",
      "description": str,
      "reference": str | null,
      "counterparty": str | null
    }}
  ]
}}

Use positive decimal strings for amounts. Skip header/footer/balance rows.
If no rows can be identified, return {{"entries": []}}.
"""
