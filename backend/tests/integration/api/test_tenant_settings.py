"""Tenant-scoped settings — keys and users."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_tenant_lists_and_creates_keys(jwt_tenant_client):
    resp = await jwt_tenant_client.get("/api/v1/tenant/keys")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)

    create = await jwt_tenant_client.post(
        "/api/v1/tenant/keys",
        json={"label": "mgmt-created"},
    )
    assert create.status_code == 201
    assert create.json()["key"].startswith("aria_")
    assert create.json()["label"] == "mgmt-created"


@pytest.mark.asyncio
async def test_tenant_creates_user(jwt_tenant_client):
    resp = await jwt_tenant_client.post(
        "/api/v1/tenant/users",
        json={"email": "invited@tenant.test", "password": "invitepass1"},
    )
    assert resp.status_code == 201
    assert resp.json()["email"] == "invited@tenant.test"


@pytest.mark.asyncio
async def test_admin_cannot_use_tenant_settings(jwt_admin_client):
    resp = await jwt_admin_client.get("/api/v1/tenant/keys")
    assert resp.status_code == 403
