"""SDK agent and LLM service tests."""

from __future__ import annotations

import json
import re

import pytest

from app.agents.sdk.llm_service import LLMService, _parse_json_block, _sanitize_narrative
from app.agents.sdk.mock_responses import mock_extraction, mock_match_reasoning
from app.agents.sdk.prompts.base import RTCIOC_SECTIONS, build_instructions
from app.agents.sdk.prompts.ingestion import INGESTION_INSTRUCTIONS
from app.models.enums import SourceFormat


def test_parse_json_block_strips_fences():
    payload = _parse_json_block('```json\n{"a": 1}\n```')
    assert payload == {"a": 1}


def test_mock_extraction_from_hint():
    payload = mock_extraction(
        filename="proof.png",
        text_hint="MOCK|USD|10.00|2026-05-18|Acme|ARIA|INV-001",
    )
    assert payload["currency"] == "USD"
    assert payload["reference"] == "INV-001"


def test_llm_service_extract_mock():
    client = LLMService()
    payload = client.extract_payment_record(
        document_bytes=b"MOCK|USD|10.00|2026-05-18|A|B|R1",
        filename="proof.png",
        source_format=SourceFormat.IMAGE,
        text_hint="MOCK|USD|10.00|2026-05-18|A|B|R1",
    )
    assert payload["amount_original"] == "10.00"


def test_llm_service_reason_match_no_candidate():
    client = LLMService()
    response = client.reason_match(
        normalised={"tolerance_low": "1", "tolerance_high": "2"},
        candidate=None,
        candidate_scores={"composite": 0.0},
    )
    assert response["status"] == "UNMATCHED"


def test_sanitize_narrative_strips_markdown():
    assert _sanitize_narrative("**Bold** text") == "Bold text"


def test_rtcico_prompt_has_all_sections():
    for section in RTCIOC_SECTIONS:
        assert section in INGESTION_INSTRUCTIONS


def test_rtcico_reminders_after_constraints():
    instructions = build_instructions(
        role="Role text",
        task="Task text",
        input_desc="Input text",
        output_desc="Output text",
        constraints=["Constraint A"],
        capabilities=["Capability A"],
        reminders=["Reminder last"],
    )
    c_idx = instructions.index("## Constraints")
    cap_idx = instructions.index("## Capabilities and reminders")
    assert c_idx < cap_idx
    assert "Reminder last" in instructions[cap_idx:]
