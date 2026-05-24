"""Ingestion stage tests."""

from __future__ import annotations

from uuid import uuid4

import pytest

from app.agents.sdk.runner import run_reconciliation
from app.graph.state import DocumentInput, ReconciliationState


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
