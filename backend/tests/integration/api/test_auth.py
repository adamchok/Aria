"""POST /api/v1/auth/login and GET /api/v1/auth/me."""

from __future__ import annotations

import pytest

from tests.conftest import (
    TEST_ADMIN_EMAIL,
    TEST_ADMIN_PASSWORD,
    TEST_TENANT_USER_EMAIL,
    TEST_TENANT_USER_PASSWORD,
)


@pytest.mark.asyncio
async def test_login_success_admin(api_client):
    resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["token_type"] == "bearer"
    assert data["access_token"]
    assert data["user"]["email"] == TEST_ADMIN_EMAIL
    assert data["user"]["role"] == "admin"


@pytest.mark.asyncio
async def test_login_wrong_password(api_client):
    resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": "wrongpassword"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_auth_me_with_bearer(jwt_admin_client):
    resp = await jwt_admin_client.get("/api/v1/auth/me")
    assert resp.status_code == 200
    assert resp.json()["email"] == TEST_ADMIN_EMAIL


@pytest.mark.asyncio
async def test_tenant_user_login(jwt_tenant_client):
    resp = await jwt_tenant_client.get("/api/v1/auth/me")
    assert resp.status_code == 200
    assert resp.json()["role"] == "tenant_user"
    assert resp.json()["tenant_id"] == "00000000-0000-0000-0001-000000000001"
