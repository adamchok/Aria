"""Unit tests for vendor learning — normalize_payee and rule application."""

from __future__ import annotations

import pytest

from app.repositories.vendor_rules_repository import VendorRulesRepository, normalize_payee
from app.agents.sdk.stages.ingestion import _apply_vendor_rules


def test_normalize_payee_strips_legal_suffixes():
    assert normalize_payee("MOONSHOT AI PTE. LTD.") == "moonshot ai"
    assert normalize_payee("Anthropic, PBC") == "anthropic"
    assert normalize_payee("Grammarly Inc") == "grammarly"
    assert normalize_payee("Cursor Usage") == "cursor usage"


def test_normalize_payee_handles_punctuation():
    # * is stripped as punctuation; CQSQM5R is an alphanumeric suffix token
    result = normalize_payee("ACME CO*CQSQM5R")
    assert "acme" in result
    assert "*" not in result


def test_apply_vendor_rules_overrides_currency():
    payload = {
        "payer": "Adam",
        "payee": "MOONSHOT AI PTE. LTD.",
        "currency": "SGD",
        "amount_original": "5.00",
        "field_confidences": {"currency": 0.6},
    }
    vendor_index = {"moonshot ai": [{"payee_pattern": "moonshot ai", "field_name": "currency", "corrected_value": "USD"}]}
    result, applied = _apply_vendor_rules(payload, vendor_index)
    assert result["currency"] == "USD"
    assert result["field_confidences"]["currency"] == 0.90
    assert ("moonshot ai", "currency") in applied


def test_apply_vendor_rules_noop_when_already_correct():
    payload = {"payee": "MOONSHOT AI PTE. LTD.", "currency": "USD", "field_confidences": {}}
    vendor_index = {"moonshot ai": [{"payee_pattern": "moonshot ai", "field_name": "currency", "corrected_value": "USD"}]}
    result, applied = _apply_vendor_rules(payload, vendor_index)
    assert result is payload  # no copy made
    assert applied == []


def test_apply_vendor_rules_no_match():
    payload = {"payee": "Anthropic PBC", "currency": "SGD", "field_confidences": {}}
    vendor_index = {"moonshot ai": [{"payee_pattern": "moonshot ai", "field_name": "currency", "corrected_value": "USD"}]}
    result, applied = _apply_vendor_rules(payload, vendor_index)
    assert result["currency"] == "SGD"
    assert applied == []


def test_apply_vendor_rules_empty_rules():
    payload = {"payee": "MOONSHOT AI PTE. LTD.", "currency": "SGD", "field_confidences": {}}
    result, applied = _apply_vendor_rules(payload, {})
    assert result is payload
    assert applied == []


def test_apply_vendor_rules_returns_all_applied_fields():
    payload = {
        "payee": "MOONSHOT AI PTE. LTD.",
        "currency": "SGD",
        "field_confidences": {},
    }
    vendor_index = {
        "moonshot ai": [
            {"payee_pattern": "moonshot ai", "field_name": "currency", "corrected_value": "USD"},
            {"payee_pattern": "moonshot ai", "field_name": "payee", "corrected_value": "Moonshot Technologies"},
        ]
    }
    result, applied = _apply_vendor_rules(payload, vendor_index)
    assert result["currency"] == "USD"
    assert result["payee"] == "Moonshot Technologies"
    assert ("moonshot ai", "currency") in applied
    assert ("moonshot ai", "payee") in applied


@pytest.mark.asyncio
async def test_increment_applied_updates_count(db_session):
    from tests.conftest import TEST_TENANT_ID

    repo = VendorRulesRepository(db_session, tenant_id=TEST_TENANT_ID)
    rule = await repo.upsert_rule(
        payee_pattern="moonshot ai",
        field_name="currency",
        corrected_value="USD",
    )
    await db_session.commit()
    assert rule.applied_count == 0

    await repo.increment_applied("moonshot ai", "currency")
    await db_session.commit()
    await db_session.refresh(rule)
    assert rule.applied_count == 1

    await repo.increment_applied("moonshot ai", "currency")
    await db_session.commit()
    await db_session.refresh(rule)
    assert rule.applied_count == 2


@pytest.mark.asyncio
async def test_increment_applied_raw_payee_is_normalized(db_session):
    from tests.conftest import TEST_TENANT_ID

    repo = VendorRulesRepository(db_session, tenant_id=TEST_TENANT_ID)
    await repo.upsert_rule(
        payee_pattern="moonshot ai pte ltd",
        field_name="currency",
        corrected_value="USD",
    )
    await db_session.commit()

    # increment_applied normalizes the pattern internally
    await repo.increment_applied("MOONSHOT AI PTE. LTD.", "currency")
    await db_session.commit()

    rules = await repo.list_for_tenant()
    assert rules[0].applied_count == 1
