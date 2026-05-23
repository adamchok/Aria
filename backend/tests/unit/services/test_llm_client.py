"""LLM client mock mode — deterministic shapes."""

from __future__ import annotations

from decimal import Decimal

from app.models.enums import SourceFormat
from app.services.llm_client import LLMClient, _parse_json_block, _sanitize_narrative


def test_extract_payment_record_mock_hint():
    client = LLMClient()
    payload = client.extract_payment_record(
        document_bytes=b"",
        filename="proof.png",
        source_format=SourceFormat.IMAGE,
        text_hint="MOCK|USD|10.00|2026-05-18|Acme US Inc|ARIA|INV-001",
    )
    assert payload["currency"] == "USD"
    assert payload["amount_original"] == "10.00"
    assert payload["payer"] == "Acme US Inc"
    assert payload["reference"] == "INV-001"
    assert 0.0 < payload["extraction_confidence"] <= 1.0


def test_extract_default_fallback_uses_filename():
    payload = LLMClient().extract_payment_record(
        document_bytes=b"random",
        filename="invoice42.png",
        source_format=SourceFormat.IMAGE,
        text_hint=None,
    )
    assert payload["reference"]
    assert payload["payee"]


def test_reason_match_mock_high_confidence_routes_matched(normalised_record_usd, bank_entry_myr):
    response = LLMClient().reason_match(
        normalised=normalised_record_usd.model_dump(mode="json"),
        candidate=bank_entry_myr.model_dump(mode="json"),
        candidate_scores={"composite": 0.88},
    )
    assert response["status"] == "MATCHED"
    assert 0.0 <= float(response["confidence"]) <= 1.0


def test_reason_match_no_candidate_unmatched(normalised_record_usd):
    response = LLMClient().reason_match(
        normalised=normalised_record_usd.model_dump(mode="json"),
        candidate=None,
        candidate_scores={"composite": 0.0},
    )
    assert response["status"] == "UNMATCHED"
    assert "no" in response["variance_explanation"].lower()


def test_parse_json_block_strips_fences():
    text = "Here is the result:\n```json\n{\"a\": 1, \"b\": [2, 3]}\n```"
    assert _parse_json_block(text) == {"a": 1, "b": [2, 3]}


def test_sanitize_narrative_strips_markdown():
    raw = "**Reconciliation Executive Narrative**\n\n**2 payment records** totalling MYR 99.25^^."
    assert _sanitize_narrative(raw) == "2 payment records totalling MYR 99.25."


def test_summarise_report_mock_contains_counts():
    text = LLMClient().summarise_report(
        summary={
            "matched_count": 3,
            "total_records": 5,
            "uncertain_count": 1,
            "unmatched_count": 1,
            "total_variance_myr": "1.20",
        },
        exceptions=[],
    )
    assert "3" in text and "5" in text
