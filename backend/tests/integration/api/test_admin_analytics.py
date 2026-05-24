"""GET /api/v1/analytics/admin/summary."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_admin_analytics_summary(jwt_admin_client):
    resp = await jwt_admin_client.get("/api/v1/analytics/admin/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_tenants" in data
    assert "by_tenant" in data


@pytest.mark.asyncio
async def test_tenant_cannot_access_admin_analytics(jwt_tenant_client):
    resp = await jwt_tenant_client.get("/api/v1/analytics/admin/summary")
    assert resp.status_code == 403
