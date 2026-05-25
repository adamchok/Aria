"""Unit tests for vendor learning — normalize_payee and rule application."""

from __future__ import annotations

from app.repositories.vendor_rules_repository import normalize_payee
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
    result = _apply_vendor_rules(payload, vendor_index)
    assert result["currency"] == "USD"
    assert result["field_confidences"]["currency"] == 0.90


def test_apply_vendor_rules_noop_when_already_correct():
    payload = {"payee": "MOONSHOT AI PTE. LTD.", "currency": "USD", "field_confidences": {}}
    vendor_index = {"moonshot ai": [{"payee_pattern": "moonshot ai", "field_name": "currency", "corrected_value": "USD"}]}
    result = _apply_vendor_rules(payload, vendor_index)
    assert result is payload  # no copy made


def test_apply_vendor_rules_no_match():
    payload = {"payee": "Anthropic PBC", "currency": "SGD", "field_confidences": {}}
    vendor_index = {"moonshot ai": [{"payee_pattern": "moonshot ai", "field_name": "currency", "corrected_value": "USD"}]}
    result = _apply_vendor_rules(payload, vendor_index)
    assert result["currency"] == "SGD"


def test_apply_vendor_rules_empty_rules():
    payload = {"payee": "MOONSHOT AI PTE. LTD.", "currency": "SGD", "field_confidences": {}}
    result = _apply_vendor_rules(payload, {})
    assert result is payload
