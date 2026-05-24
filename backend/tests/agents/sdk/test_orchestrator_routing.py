"""Orchestrator routing guardrail tests."""

from __future__ import annotations

from uuid import uuid4

from app.agents.sdk.context import ReconciliationContext
from app.agents.sdk.routing import should_escalate_after_ingestion, should_run_matching
from app.graph.state import ReconciliationState
from app.models.schemas import NormalisedRecord, PaymentRecord
from app.models.enums import SourceFormat
from datetime import date
from decimal import Decimal


def test_escalate_when_no_records():
    state = ReconciliationState(job_id=uuid4(), payment_records=[])
    ctx = ReconciliationContext(state=state)
    assert should_escalate_after_ingestion(ctx) is True


def test_escalate_when_low_confidence():
    rec = PaymentRecord(
        payer="A",
        payee="B",
        amount_original=Decimal("1"),
        currency="USD",
        value_date=date(2026, 5, 1),
        source_format=SourceFormat.IMAGE,
        extraction_confidence=0.3,
    )
    state = ReconciliationState(job_id=uuid4(), payment_records=[rec])
    ctx = ReconciliationContext(state=state)
    assert should_escalate_after_ingestion(ctx) is True


def test_normalisation_routes_to_matching_when_records_exist():
    rec = PaymentRecord(
        payer="A",
        payee="B",
        amount_original=Decimal("1"),
        currency="USD",
        value_date=date(2026, 5, 1),
        source_format=SourceFormat.IMAGE,
        extraction_confidence=0.9,
    )
    state = ReconciliationState(job_id=uuid4(), payment_records=[rec])
    ctx = ReconciliationContext(state=state)
    assert should_escalate_after_ingestion(ctx) is False


def test_should_run_matching_false_when_no_normalised_records():
    state = ReconciliationState(job_id=uuid4(), normalised_records=[])
    ctx = ReconciliationContext(state=state)
    assert should_run_matching(ctx) is False


def test_should_run_matching_true_when_normalised_records_exist():
    pr = PaymentRecord(
        payer="A",
        payee="B",
        amount_original=Decimal("100"),
        currency="USD",
        value_date=date(2026, 5, 1),
        source_format=SourceFormat.IMAGE,
        extraction_confidence=0.9,
    )
    nr = NormalisedRecord(
        payment=pr,
        amount_myr_at_invoice_rate=Decimal("450"),
        amount_myr_at_settlement_rate=Decimal("452"),
        tolerance_low=Decimal("440"),
        tolerance_high=Decimal("460"),
        estimated_charges_myr=Decimal("5"),
        fx_rate_invoice=Decimal("4.5"),
        fx_rate_settlement=Decimal("4.52"),
    )
    state = ReconciliationState(job_id=uuid4(), normalised_records=[nr])
    ctx = ReconciliationContext(state=state)
    assert should_run_matching(ctx) is True
