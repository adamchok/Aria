"""Ingestion stage tests."""

from __future__ import annotations

from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from app.agents.sdk.context import ReconciliationContext
from app.agents.sdk.llm_service import LLMService
from app.agents.sdk.runner import run_reconciliation
from app.agents.sdk.stages.ingestion import _extract_one, _is_rate_limit_error
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


# ── _is_rate_limit_error ──────────────────────────────────────────────────────

def test_is_rate_limit_error_by_status_code():
    exc = Exception("rate limited")
    exc.status_code = 429  # type: ignore[attr-defined]
    assert _is_rate_limit_error(exc) is True


def test_is_rate_limit_error_by_type_name():
    class RateLimitError(Exception):
        pass

    assert _is_rate_limit_error(RateLimitError("too many")) is True


def test_is_rate_limit_error_false_for_other():
    assert _is_rate_limit_error(ValueError("bad value")) is False
    assert _is_rate_limit_error(RuntimeError("server error")) is False


# ── retry logic in _extract_one ──────────────────────────────────────────────

def _make_ctx(max_retries: int = 2, concurrency: int = 3) -> ReconciliationContext:
    settings = Settings(
        llm_mode="mock",
        ingestion_max_retries=max_retries,
        ingestion_concurrency=concurrency,
    )
    state = ReconciliationState(job_id=uuid4())
    ctx = ReconciliationContext(state=state, settings=settings)
    return ctx


def _make_doc() -> DocumentInput:
    return DocumentInput(
        storage_key="k/proof.png",
        filename="proof.png",
        bytes_data=b"MOCK|USD|50.00|2026-05-18|Vendor X|ARIA|REF-99",
    )


def test_extract_one_retries_on_rate_limit_then_succeeds():
    """Succeeds on second attempt after a 429 on the first."""
    ctx = _make_ctx(max_retries=2)
    llm = MagicMock(spec=LLMService)
    llm.mode = "mock"

    rate_exc = Exception("rate limited")
    rate_exc.status_code = 429  # type: ignore[attr-defined]
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
        "source_format": SourceFormat.IMAGE,
    }
    llm.extract_payment_record.side_effect = [rate_exc, good_payload]

    with patch("app.agents.sdk.stages.ingestion.time.sleep"):
        record, applied = _extract_one(_make_doc(), ctx, llm)

    assert record.currency == "USD"
    assert llm.extract_payment_record.call_count == 2


def test_extract_one_raises_after_exhausting_retries():
    """Raises ExtractionError when all retry attempts return 429."""
    ctx = _make_ctx(max_retries=2)
    llm = MagicMock(spec=LLMService)
    llm.mode = "mock"

    rate_exc = Exception("rate limited")
    rate_exc.status_code = 429  # type: ignore[attr-defined]
    llm.extract_payment_record.side_effect = rate_exc

    with patch("app.agents.sdk.stages.ingestion.time.sleep"):
        with pytest.raises(ExtractionError, match="LLM extraction failed"):
            _extract_one(_make_doc(), ctx, llm)

    # 1 initial + max_retries retries = 3 total calls
    assert llm.extract_payment_record.call_count == 3


def test_extract_one_no_retry_on_non_rate_limit_error():
    """Non-429 errors are not retried."""
    ctx = _make_ctx(max_retries=3)
    llm = MagicMock(spec=LLMService)
    llm.mode = "mock"

    llm.extract_payment_record.side_effect = ValueError("bad schema")

    with patch("app.agents.sdk.stages.ingestion.time.sleep") as mock_sleep:
        with pytest.raises(ExtractionError):
            _extract_one(_make_doc(), ctx, llm)

    assert llm.extract_payment_record.call_count == 1
    mock_sleep.assert_not_called()


def test_extract_one_zero_retries_fails_immediately_on_rate_limit():
    """With max_retries=0, a 429 fails immediately without sleeping."""
    ctx = _make_ctx(max_retries=0)
    llm = MagicMock(spec=LLMService)
    llm.mode = "mock"

    rate_exc = Exception("rate limited")
    rate_exc.status_code = 429  # type: ignore[attr-defined]
    llm.extract_payment_record.side_effect = rate_exc

    with patch("app.agents.sdk.stages.ingestion.time.sleep") as mock_sleep:
        with pytest.raises(ExtractionError):
            _extract_one(_make_doc(), ctx, llm)

    assert llm.extract_payment_record.call_count == 1
    mock_sleep.assert_not_called()
