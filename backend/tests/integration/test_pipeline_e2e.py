"""End-to-end pipeline test against the synchronous LangGraph driver.

Marked ``slow`` because it exercises every agent + service in-process. Mock
LLM keeps it deterministic and under a second.
"""

from __future__ import annotations

import time
from pathlib import Path
from uuid import uuid4

import pytest

from app.graph.builder import run_pipeline
from app.graph.state import DocumentInput, ReconciliationState
from app.models.enums import JobStatus, MatchStatus


@pytest.mark.slow
def test_full_pipeline_four_corridors(fixtures_dir: Path):
    proofs = []
    for fname in ("usd_invoice.txt", "eur_invoice.txt", "gbp_invoice.txt", "sgd_invoice.txt"):
        body = (fixtures_dir / "payment_proofs" / fname).read_bytes()
        proofs.append(
            DocumentInput(storage_key=f"test/{fname}", filename=fname.replace(".txt", ".png"), bytes_data=body)
        )
    statement_bytes = (fixtures_dir / "bank_statements" / "may_2026.csv").read_bytes()

    state = ReconciliationState(
        job_id=uuid4(),
        payment_documents=proofs,
        bank_statement_input=DocumentInput(
            storage_key="test/may.csv", filename="may.csv", bytes_data=statement_bytes
        ),
        base_currency="MYR",
    )

    start = time.perf_counter()
    out = run_pipeline(state)
    elapsed = time.perf_counter() - start

    assert out.status in {JobStatus.COMPLETED, JobStatus.AWAITING_REVIEW}
    assert out.report is not None
    assert out.report.summary.total_records == 4
    # We expect every corridor to find its candidate row in the synthetic stmt.
    assert out.report.summary.matched_count + out.report.summary.uncertain_count == 4
    assert out.report.summary.unmatched_count == 0
    # The CLAUDE.md target is <60s for a batch of 50; in-process mock should
    # finish in well under a second on any machine.
    assert elapsed < 10.0
    # Audit log captures every agent decision.
    actions = {entry.action for entry in out.audit_log}
    assert "extract" in actions
    assert "normalise" in actions
    assert "match" in actions
    assert "report_generated" in actions
