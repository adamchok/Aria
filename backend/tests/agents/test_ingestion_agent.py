"""Agent 1 — Document Ingestion."""

from __future__ import annotations

from uuid import uuid4

from app.agents.ingestion import IngestionAgent
from app.graph.state import DocumentInput, ReconciliationState
from app.services.llm_client import LLMClient


def _state_with_image(bytes_data: bytes) -> ReconciliationState:
    return ReconciliationState(
        job_id=uuid4(),
        payment_documents=[
            DocumentInput(storage_key="k/proof.png", filename="proof.png", bytes_data=bytes_data)
        ],
    )


def test_ingestion_extracts_from_mock_hint_embedded_in_bytes():
    text = b"MOCK|USD|10.00|2026-05-18|Acme US Inc|ARIA|INV-001"
    state = _state_with_image(text)
    out = IngestionAgent(llm=LLMClient())(state)
    assert len(out.payment_records) == 1
    rec = out.payment_records[0]
    assert rec.currency == "USD"
    assert str(rec.amount_original) == "10.00"
    assert rec.reference == "INV-001"
    assert rec.extraction_confidence > 0.5
    assert any(e.action == "extract" for e in out.audit_log)


def test_ingestion_records_low_confidence_when_no_hint():
    state = _state_with_image(b"\x89PNG\r\n")
    out = IngestionAgent()(state)
    assert len(out.payment_records) == 1
    # No hint -> mock returns a low-but-defined confidence with synthesised fields.
    assert 0.0 < out.payment_records[0].extraction_confidence <= 1.0


def test_ingestion_audits_each_document():
    state = ReconciliationState(
        job_id=uuid4(),
        payment_documents=[
            DocumentInput(
                storage_key="a", filename="a.png", bytes_data=b"MOCK|USD|1.00|2026-05-01|A|B|R1"
            ),
            DocumentInput(
                storage_key="b", filename="b.png", bytes_data=b"MOCK|EUR|2.00|2026-05-02|C|D|R2"
            ),
        ],
    )
    out = IngestionAgent()(state)
    assert len(out.payment_records) == 2
    extract_events = [e for e in out.audit_log if e.action == "extract"]
    assert len(extract_events) == 2
    assert "ingestion" in out.agents_completed
