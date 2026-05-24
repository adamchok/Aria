"""Admin user management endpoints."""

from __future__ import annotations

import pytest

from tests.conftest import TEST_TENANT_ID, TEST_TENANT_USER_EMAIL


@pytest.mark.asyncio
async def test_admin_creates_tenant_user(jwt_admin_client):
    resp = await jwt_admin_client.post(
        "/api/v1/users",
        json={
            "email": "newuser@tenant.test",
            "password": "newpass123",
            "role": "tenant_user",
            "tenant_id": TEST_TENANT_ID,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["email"] == "newuser@tenant.test"


@pytest.mark.asyncio
async def test_admin_lists_users(jwt_admin_client):
    resp = await jwt_admin_client.get("/api/v1/users")
    assert resp.status_code == 200
    emails = {u["email"] for u in resp.json()}
    assert TEST_TENANT_USER_EMAIL in emails


@pytest.mark.asyncio
async def test_tenant_jwt_cannot_list_users(jwt_tenant_client):
    resp = await jwt_tenant_client.get("/api/v1/users")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_deactivates_user(jwt_admin_client):
    create = await jwt_admin_client.post(
        "/api/v1/users",
        json={
            "email": "deactivate@tenant.test",
            "password": "deactivate1",
            "role": "tenant_user",
            "tenant_id": TEST_TENANT_ID,
        },
    )
    user_id = create.json()["id"]
    resp = await jwt_admin_client.delete(f"/api/v1/users/{user_id}")
    assert resp.status_code == 204
