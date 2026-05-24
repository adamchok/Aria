"""Admin queue status and flush."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from tests.conftest import TEST_TENANT_ID


@pytest.mark.asyncio
async def test_admin_queue_status(jwt_admin_client):
    resp = await jwt_admin_client.get("/api/v1/ingest/admin/queue")
    assert resp.status_code == 200
    data = resp.json()
    assert "tenants" in data
    assert "total_buffered_system" in data


@pytest.mark.asyncio
async def test_admin_flush_queue(jwt_admin_client):
    with patch("app.workers.tasks.batch_tenant_transactions.delay") as mock_delay:
        resp = await jwt_admin_client.post(f"/api/v1/ingest/admin/queue/flush/{TEST_TENANT_ID}")
        assert resp.status_code == 202
        assert resp.json()["status"] == "flush_queued"
        mock_delay.assert_called_once_with(TEST_TENANT_ID)


@pytest.mark.asyncio
async def test_tenant_cannot_access_admin_queue(jwt_tenant_client):
    resp = await jwt_tenant_client.get("/api/v1/ingest/admin/queue")
    assert resp.status_code == 403
