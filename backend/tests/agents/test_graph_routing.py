"""Conditional edges of the LangGraph state machine."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

from app.core.config import Settings
from app.graph.routing import after_ingestion, after_matching, after_normalisation
from app.graph.state import ReconciliationState
from app.models.enums import SourceFormat
from app.models.schemas import PaymentRecord


def _record(confidence: float) -> PaymentRecord:
    return PaymentRecord(
        payer="A",
        payee="B",
        amount_original=Decimal("1.00"),
        currency="USD",
        value_date=date(2026, 5, 18),
        source_format=SourceFormat.IMAGE,
        extraction_confidence=confidence,
    )


def test_no_records_routes_to_review(monkeypatch):
    state = ReconciliationState(job_id=uuid4())
    assert after_ingestion(state) == "human_review_queue"


def test_avg_below_threshold_routes_to_review(monkeypatch):
    monkeypatch.setenv("EXTRACTION_ESCALATION_THRESHOLD", "0.5")
    from app.core import config as cfg

    cfg.get_settings.cache_clear()
    state = ReconciliationState(
        job_id=uuid4(), payment_records=[_record(0.3), _record(0.4)]
    )
    assert after_ingestion(state) == "human_review_queue"


def test_avg_above_threshold_routes_to_normalisation(monkeypatch):
    monkeypatch.setenv("EXTRACTION_ESCALATION_THRESHOLD", "0.5")
    from app.core import config as cfg

    cfg.get_settings.cache_clear()
    state = ReconciliationState(
        job_id=uuid4(), payment_records=[_record(0.8), _record(0.9)]
    )
    assert after_ingestion(state) == "normalisation"


def test_after_normalisation_routes_to_report_when_empty():
    state = ReconciliationState(job_id=uuid4())
    assert after_normalisation(state) == "report"


def test_after_matching_always_report():
    state = ReconciliationState(job_id=uuid4())
    assert after_matching(state) == "report"
