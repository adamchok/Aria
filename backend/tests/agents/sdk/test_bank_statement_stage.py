"""Bank statement SDK stage tests."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest

from app.agents.sdk.context import ReconciliationContext
from app.agents.sdk.llm_service import LLMService
from app.agents.sdk.runner import run_reconciliation
from app.agents.sdk.stages.bank_statement import (
    BankStatementExtractionMethod,
    extract_bank_statement,
)
from app.core.exceptions import ExtractionError, LLMError
from app.graph.state import DocumentInput, ReconciliationState
from app.tools.file_parsers import parse_bank_statement_csv

CIMB_FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "fixtures/bank_statements/cimb_savings_apr2026.pdf"
)
MAY_CSV_FIXTURE = (
    Path(__file__).resolve().parents[2] / "fixtures/bank_statements/may_2026.csv"
)


class _FailingBankStatementLLM:
    @property
    def mode(self) -> str:
        return "mock"

    def extract_bank_statement(self, **_kwargs: Any) -> dict[str, Any]:
        raise LLMError("simulated outage")


def _pdf_doc(data: bytes, filename: str = "statement.pdf") -> DocumentInput:
    return DocumentInput(
        storage_key="k/statement.pdf",
        filename=filename,
        bytes_data=data,
    )


def test_pdf_llm_first_with_mock_hint():
    mock_stmt = b"MOCK|STMT|2026-05-20|4179.24|Inward TT|INV-001|ACME US INC"
    result = extract_bank_statement(_pdf_doc(mock_stmt), "MYR")
    assert result.method == BankStatementExtractionMethod.LLM_PDF
    assert len(result.statement.entries) == 1
    assert result.statement.entries[0].reference == "INV-001"


def test_pdf_falls_back_to_pdfplumber_when_llm_fails():
    if not CIMB_FIXTURE.is_file():
        pytest.skip("CIMB fixture PDF not present")

    class _Svc:
        mode = "live"

        def extract_bank_statement(self, **_kwargs):
            raise LLMError("simulated outage")

    result = extract_bank_statement(
        _pdf_doc(CIMB_FIXTURE.read_bytes(), "cimb.pdf"),
        "MYR",
        llm=_Svc(),  # type: ignore[arg-type]
    )
    assert result.method == BankStatementExtractionMethod.STRUCTURED
    assert len(result.statement.entries) == 6


def test_csv_uses_structured_parser():
    data = MAY_CSV_FIXTURE.read_bytes()
    result = extract_bank_statement(
        DocumentInput(storage_key="", filename="may.csv", bytes_data=data),
        "MYR",
    )
    assert result.method == BankStatementExtractionMethod.STRUCTURED
    expected = parse_bank_statement_csv(data, base_currency="MYR")
    assert len(result.statement.entries) == len(expected.entries)


@pytest.mark.asyncio
async def test_pipeline_delegates_bank_statement_audit():
    mock_stmt = b"MOCK|STMT|2026-05-20|4179.24|Inward TT|INV-001|ACME US INC"
    state = ReconciliationState(
        job_id=uuid4(),
        base_currency="MYR",
        bank_statement_input=_pdf_doc(mock_stmt),
        payment_documents=[
            DocumentInput(
                storage_key="k/proof.png",
                filename="proof.png",
                bytes_data=b"MOCK|USD|10.00|2026-05-18|A|B|R1",
            )
        ],
    )
    out = await run_reconciliation(state)
    assert out.bank_statement is not None
    parsed_events = [e for e in out.audit_log if e.action == "bank_statement_parsed"]
    assert len(parsed_events) == 1
    assert parsed_events[0].agent == "bank_statement_ingestion"
