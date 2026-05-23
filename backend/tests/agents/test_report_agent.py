"""Agent 4 — Audit & Report."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import uuid4

from app.agents.report import ReportAgent
from app.graph.state import ReconciliationState
from app.models.enums import JobStatus, MatchStatus
from app.models.schemas import MatchResult


def _matches(normalised, bank_entry):
    return [
        MatchResult(
            normalised_record=normalised,
            bank_entry=bank_entry,
            confidence=0.9,
            status=MatchStatus.MATCHED,
            amount_variance_myr=Decimal("0.10"),
        ),
        MatchResult(
            normalised_record=normalised,
            bank_entry=None,
            confidence=0.6,
            status=MatchStatus.UNCERTAIN,
            amount_variance_myr=Decimal("0"),
        ),
    ]


def test_report_summary_counts(normalised_record_usd, bank_entry_myr):
    state = ReconciliationState(
        job_id=uuid4(),
        match_results=_matches(normalised_record_usd, bank_entry_myr),
        base_currency="MYR",
        started_at=datetime.utcnow(),
    )
    out = ReportAgent()(state)
    assert out.report is not None
    assert out.report.summary.total_records == 2
    assert out.report.summary.matched_count == 1
    assert out.report.summary.uncertain_count == 1
    assert out.report.summary.unmatched_count == 0
    assert out.status == JobStatus.AWAITING_REVIEW
    assert "report" in out.agents_completed


def test_report_completes_when_no_uncertain(normalised_record_usd, bank_entry_myr):
    matches = [
        MatchResult(
            normalised_record=normalised_record_usd,
            bank_entry=bank_entry_myr,
            confidence=0.9,
            status=MatchStatus.MATCHED,
        )
    ]
    state = ReconciliationState(
        job_id=uuid4(), match_results=matches, started_at=datetime.utcnow()
    )
    out = ReportAgent()(state)
    assert out.status == JobStatus.COMPLETED
