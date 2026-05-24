"""RTCIOC prompt structure tests."""

from __future__ import annotations

from app.agents.sdk.prompts.bank_statement import BANK_STATEMENT_PDF_INSTRUCTIONS, BANK_STATEMENT_TEXT_INSTRUCTIONS
from app.agents.sdk.prompts.base import RTCIOC_SECTIONS
from app.agents.sdk.prompts.ingestion import INGESTION_INSTRUCTIONS
from app.agents.sdk.prompts.matching import MATCHING_INSTRUCTIONS
from app.agents.sdk.prompts.orchestrator import ORCHESTRATOR_INSTRUCTIONS
from app.agents.sdk.prompts.report import REPORT_INSTRUCTIONS


def test_all_specialist_prompts_have_rtcico_sections():
    for instructions in (
        BANK_STATEMENT_PDF_INSTRUCTIONS,
        BANK_STATEMENT_TEXT_INSTRUCTIONS,
        INGESTION_INSTRUCTIONS,
        MATCHING_INSTRUCTIONS,
        ORCHESTRATOR_INSTRUCTIONS,
        REPORT_INSTRUCTIONS,
    ):
        for section in RTCIOC_SECTIONS:
            assert section in instructions
