"""Integration tests for /api/v1/vendor-rules endpoints."""

from __future__ import annotations

import pytest

from app.repositories.vendor_rules_repository import VendorRulesRepository
from tests.conftest import TEST_TENANT_ID


async def _seed_rule(db_session, **kwargs) -> str:
    repo = VendorRulesRepository(db_session, tenant_id=TEST_TENANT_ID)
    rule = await repo.upsert_rule(
        payee_pattern=kwargs.get("payee_pattern", "moonshot ai"),
        field_name=kwargs.get("field_name", "currency"),
        corrected_value=kwargs.get("corrected_value", "USD"),
        original_value=kwargs.get("original_value", "SGD"),
        source_note=kwargs.get("source_note", "Confirmed via review queue"),
    )
    await db_session.commit()
    return rule.id


@pytest.mark.asyncio
async def test_list_vendor_rules_empty(api_client):
    resp = await api_client.get("/api/v1/vendor-rules")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_vendor_rules_returns_seeded_rule(api_client, db_session):
    rule_id = await _seed_rule(db_session)

    resp = await api_client.get("/api/v1/vendor-rules")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == rule_id
    assert data[0]["payee_pattern"] == "moonshot ai"
    assert data[0]["field_name"] == "currency"
    assert data[0]["corrected_value"] == "USD"
    assert data[0]["original_value"] == "SGD"
    assert data[0]["source_note"] == "Confirmed via review queue"
    assert "applied_count" in data[0]


@pytest.mark.asyncio
async def test_update_vendor_rule_corrected_value(api_client, db_session):
    rule_id = await _seed_rule(db_session)

    resp = await api_client.put(
        f"/api/v1/vendor-rules/{rule_id}",
        json={"corrected_value": "EUR"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["corrected_value"] == "EUR"
    assert body["id"] == rule_id


@pytest.mark.asyncio
async def test_update_vendor_rule_source_note(api_client, db_session):
    rule_id = await _seed_rule(db_session)

    resp = await api_client.put(
        f"/api/v1/vendor-rules/{rule_id}",
        json={"corrected_value": "USD", "source_note": "Updated note"},
    )
    assert resp.status_code == 200
    assert resp.json()["source_note"] == "Updated note"


@pytest.mark.asyncio
async def test_update_vendor_rule_404_for_unknown_id(api_client):
    resp = await api_client.put(
        "/api/v1/vendor-rules/00000000-0000-0000-0000-000000000000",
        json={"corrected_value": "EUR"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_vendor_rule_404_for_other_tenant(api_client, db_session):
    repo = VendorRulesRepository(db_session, tenant_id="other-tenant-id")
    rule = await repo.upsert_rule(
        payee_pattern="stripe inc",
        field_name="currency",
        corrected_value="USD",
    )
    await db_session.commit()

    resp = await api_client.put(
        f"/api/v1/vendor-rules/{rule.id}",
        json={"corrected_value": "SGD"},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_vendor_rule(api_client, db_session):
    rule_id = await _seed_rule(db_session)

    resp = await api_client.delete(f"/api/v1/vendor-rules/{rule_id}")
    assert resp.status_code == 204

    listed = await api_client.get("/api/v1/vendor-rules")
    assert all(r["id"] != rule_id for r in listed.json())


@pytest.mark.asyncio
async def test_delete_vendor_rule_404_for_unknown_id(api_client):
    resp = await api_client.delete(
        "/api/v1/vendor-rules/00000000-0000-0000-0000-000000000000"
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_vendor_rule_404_for_other_tenant(api_client, db_session):
    repo = VendorRulesRepository(db_session, tenant_id="other-tenant-id")
    rule = await repo.upsert_rule(
        payee_pattern="stripe inc",
        field_name="currency",
        corrected_value="USD",
    )
    await db_session.commit()

    resp = await api_client.delete(f"/api/v1/vendor-rules/{rule.id}")
    assert resp.status_code == 404
