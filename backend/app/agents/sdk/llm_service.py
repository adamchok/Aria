"""Anthropic LLM calls for SDK specialists (live mode)."""

from __future__ import annotations

import base64
import json
import re
from typing import Any

from app.agents.sdk.mock_responses import (
    mock_bank_statement,
    mock_extraction,
    mock_match_reasoning,
    mock_report_narrative,
)
from app.agents.sdk.prompts.bank_statement import (
    BANK_STATEMENT_PDF_INSTRUCTIONS,
    BANK_STATEMENT_TEXT_INSTRUCTIONS,
)
from app.agents.sdk.prompts.ingestion import INGESTION_INSTRUCTIONS
from app.agents.sdk.prompts.matching import MATCHING_USER_TEMPLATE
from app.agents.sdk.prompts.report import REPORT_USER_TEMPLATE
from app.core.config import Settings, get_settings
from app.core.exceptions import LLMError
from app.core.logging import get_logger
from app.models.enums import SourceFormat
from app.tools.file_parsers import detect_image_media_type

logger = get_logger(__name__)


def _parse_json_block(text: str) -> dict[str, Any]:
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
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


def _sanitize_narrative(text: str) -> str:
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


class LLMService:
    """Anthropic-backed LLM surface for pipeline specialists."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._anthropic: Any = None

    @property
    def mode(self) -> str:
        return self._settings.llm_mode

    def _get_anthropic(self) -> Any:
        if self._anthropic is None:
            try:
                from anthropic import Anthropic
            except ImportError as exc:
                raise LLMError("anthropic package not installed") from exc
            self._anthropic = Anthropic(api_key=self._settings.anthropic_api_key)
        return self._anthropic

    def extract_payment_record(
        self,
        *,
        document_bytes: bytes,
        filename: str,
        source_format: SourceFormat,
        text_hint: str | None = None,
    ) -> dict[str, Any]:
        if self._settings.llm_mode == "mock":
            return mock_extraction(filename=filename, text_hint=text_hint)

        if source_format == SourceFormat.IMAGE:
            model = self._settings.opus_model
        elif source_format in {SourceFormat.EXCEL, SourceFormat.CSV}:
            model = self._settings.haiku_model
        else:
            model = self._settings.sonnet_model

        content: list[dict[str, Any]] = []
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
            content.append(
                {
                    "type": "text",
                    "text": (text_hint or document_bytes.decode("utf-8", errors="replace"))[:40_000],
                }
            )

        client = self._get_anthropic()
        try:
            resp = client.messages.create(
                model=model,
                max_tokens=2048,
                system=[
                    {
                        "type": "text",
                        "text": INGESTION_INSTRUCTIONS,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                messages=[{"role": "user", "content": content}],
            )
        except Exception as exc:
            raise LLMError(f"Anthropic extract call failed: {exc}") from exc

        text = "".join(block.text for block in resp.content if getattr(block, "type", "") == "text")
        return _parse_json_block(text)

    def extract_bank_statement(
        self,
        *,
        text_hint: str,
        filename: str,
        base_currency: str,
        pdf_bytes: bytes | None = None,
    ) -> dict[str, Any]:
        if self._settings.llm_mode == "mock":
            return mock_bank_statement(
                text_hint=text_hint, filename=filename, base_currency=base_currency
            )

        client = self._get_anthropic()
        if pdf_bytes is not None:
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
                    "text": (
                        f"Filename: {filename}\nBase currency: {base_currency}\n\n"
                        f"{BANK_STATEMENT_PDF_INSTRUCTIONS}"
                    ),
                },
            ]
            model = self._settings.sonnet_model
        else:
            content = [
                {
                    "type": "text",
                    "text": (
                        f"Filename: {filename}\nBase currency: {base_currency}\n\n"
                        f"{BANK_STATEMENT_TEXT_INSTRUCTIONS}\n\nStatement text:\n{text_hint[:40_000]}"
                    ),
                }
            ]
            model = self._settings.haiku_model

        try:
            resp = client.messages.create(
                model=model,
                max_tokens=4096,
                messages=[{"role": "user", "content": content}],
            )
        except Exception as exc:
            raise LLMError(f"Anthropic bank-statement call failed: {exc}") from exc

        text = "".join(block.text for block in resp.content if getattr(block, "type", "") == "text")
        return _parse_json_block(text)

    def reason_match(
        self,
        *,
        normalised: dict[str, Any],
        candidate: dict[str, Any] | None,
        candidate_scores: dict[str, Any],
    ) -> dict[str, Any]:
        if self._settings.llm_mode == "mock":
            return mock_match_reasoning(normalised, candidate, candidate_scores)

        from app.agents.sdk.prompts.matching import MATCHING_INSTRUCTIONS

        # Fix C: borderline (0.45-0.65) records go to human review regardless of
        # model — the Opus second-call added latency without changing the outcome.
        return self._reason_match_with_model(
            self._settings.sonnet_model,
            instructions=MATCHING_INSTRUCTIONS,
            normalised=normalised,
            candidate=candidate,
            candidate_scores=candidate_scores,
        )

    def _reason_match_with_model(
        self,
        model: str,
        *,
        instructions: str,
        normalised: dict[str, Any],
        candidate: dict[str, Any] | None,
        candidate_scores: dict[str, Any],
    ) -> dict[str, Any]:
        prompt = MATCHING_USER_TEMPLATE.format(
            normalised=json.dumps(normalised, default=str),
            candidate=json.dumps(candidate, default=str) if candidate else "null",
            scores=json.dumps(candidate_scores, default=str),
        )
        client = self._get_anthropic()
        try:
            resp = client.messages.create(
                model=model,
                max_tokens=8000,
                system=instructions,
                thinking={"type": "adaptive"},
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as exc:
            raise LLMError(f"Anthropic match call failed: {exc}") from exc
        text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
        return _parse_json_block(text)

    def summarise_report(self, *, summary: dict[str, Any], exceptions: list[dict[str, Any]]) -> str:
        if self._settings.llm_mode == "mock":
            return _sanitize_narrative(mock_report_narrative(summary, exceptions))

        from app.agents.sdk.prompts.report import REPORT_INSTRUCTIONS

        prompt = REPORT_USER_TEMPLATE.format(
            summary=json.dumps(summary, default=str),
            exceptions=json.dumps(exceptions, default=str)[:8_000],
        )
        client = self._get_anthropic()
        try:
            resp = client.messages.create(
                model=self._settings.sonnet_model,
                max_tokens=1024,
                system=REPORT_INSTRUCTIONS,
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as exc:
            raise LLMError(f"Anthropic report call failed: {exc}") from exc
        raw = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()
        return _sanitize_narrative(raw)
