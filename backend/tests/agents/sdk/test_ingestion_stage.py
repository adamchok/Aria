"""Ingestion stage tests."""

from __future__ import annotations

from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.agents.sdk.context import ReconciliationContext
from app.agents.sdk.llm_service import LLMService
from app.agents.sdk.llm_retry import is_rate_limit_error
from app.agents.sdk.runner import run_reconciliation
from app.agents.sdk.stages.ingestion import _extract_one
from app.core.config import Settings
from app.core.exceptions import ExtractionError
from app.graph.state import DocumentInput, ReconciliationState
from app.models.enums import SourceFormat


@pytest.mark.asyncio
async def test_ingestion_extracts_from_mock_hint():
    state = ReconciliationState(
        job_id=uuid4(),
        payment_documents=[
            DocumentInput(
                storage_key="k/proof.png",
                filename="proof.png",
                bytes_data=b"MOCK|USD|10.00|2026-05-18|Acme US Inc|ARIA|INV-001",
            )
        ],
    )
    out = await run_reconciliation(state)
    assert len(out.payment_records) == 1
    rec = out.payment_records[0]
    assert rec.currency == "USD"
    assert str(rec.amount_original) == "10.00"
    assert rec.reference == "INV-001"
    assert rec.extraction_confidence > 0.5
    assert any(e.action == "extract" for e in out.audit_log)


def test_is_rate_limit_error_by_status_code():
    exc = Exception("rate limited")
    exc.status_code = 429  # type: ignore[attr-defined]
    assert is_rate_limit_error(exc) is True


def test_is_rate_limit_error_by_type_name():
    class RateLimitError(Exception):
        pass

    assert is_rate_limit_error(RateLimitError("too many")) is True


def test_is_rate_limit_error_false_for_other():
    assert is_rate_limit_error(ValueError("bad value")) is False
    assert is_rate_limit_error(RuntimeError("server error")) is False


def _make_ctx() -> ReconciliationContext:
    settings = Settings(llm_mode="mock", ingestion_max_retries=2, ingestion_concurrency=3)
    state = ReconciliationState(job_id=uuid4())
    return ReconciliationContext(state=state, settings=settings)


def _make_doc() -> DocumentInput:
    return DocumentInput(
        storage_key="k/proof.png",
        filename="proof.png",
        bytes_data=b"MOCK|USD|50.00|2026-05-18|Vendor X|ARIA|REF-99",
    )


def test_extract_one_raises_on_llm_failure():
    ctx = _make_ctx()
    llm = MagicMock(spec=LLMService)
    llm.mode = "mock"
    llm.extract_payment_record.side_effect = ValueError("bad schema")

    with pytest.raises(ExtractionError, match="LLM extraction failed"):
        _extract_one(_make_doc(), ctx, llm)

    assert llm.extract_payment_record.call_count == 1


def test_extract_one_delegates_retry_to_llm_service():
    """Stage no longer retries locally; LLMService handles 429 backoff."""
    ctx = _make_ctx()
    llm = MagicMock(spec=LLMService)
    llm.mode = "live"
    good_payload = {
        "payer": "ARIA",
        "payee": "Vendor X",
        "amount_original": "50.00",
        "currency": "USD",
        "value_date": "2026-05-18",
        "reference": "REF-99",
        "extraction_confidence": 0.95,
        "raw_extracted_text": "MOCK",
        "field_confidences": {},
    }
    llm.extract_payment_record.return_value = good_payload

    record, _applied = _extract_one(_make_doc(), ctx, llm)
    assert record.currency == "USD"
    llm.extract_payment_record.assert_called_once()
