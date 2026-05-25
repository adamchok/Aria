"""Integration tests for /api/v1/webhooks endpoints."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.models.enums import WebhookEvent
from tests.conftest import TEST_TENANT_ID


@pytest.mark.asyncio
async def test_register_and_list_webhooks(api_client):
    create = await api_client.post(
        "/api/v1/webhooks",
        json={
            "url": "https://webhook.site/test-endpoint",
            "events": [WebhookEvent.JOB_COMPLETED],
            "label": "Test",
        },
    )
    assert create.status_code == 201, create.text
    body = create.json()
    assert body["url"].startswith("https://webhook.site/")
    assert body["secret"].startswith("whsec_")

    listed = await api_client.get("/api/v1/webhooks")
    assert listed.status_code == 200
    assert any(w["id"] == body["id"] for w in listed.json())


@pytest.mark.asyncio
async def test_send_test_event_delivers_without_job_fk(api_client, db_session):
    from unittest.mock import MagicMock

    from app.repositories.webhook_repository import WebhookRepository
    from app.workers.tasks import _deliver_webhook

    create = await api_client.post(
        "/api/v1/webhooks",
        json={
            "url": "https://webhook.site/b5b20a18-8be7-4b60-ac29-f37fea024d26",
            "events": [WebhookEvent.JOB_COMPLETED],
            "label": "Test Webhook",
        },
    )
    webhook_id = create.json()["id"]

    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.text = "OK"

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    mock_task = MagicMock()
    mock_task.request.retries = 0

    with patch("app.workers.tasks.httpx.AsyncClient", return_value=mock_client):
        await _deliver_webhook(mock_task, webhook_id, None, "job.test")

    repo = WebhookRepository(db_session)
    deliveries = await repo.list_deliveries(webhook_id, TEST_TENANT_ID)
    assert len(deliveries) == 1
    assert deliveries[0].event == "job.test"
    assert deliveries[0].job_id is None
    assert deliveries[0].status.value == "SUCCESS"
    assert deliveries[0].response_code == 200


@pytest.mark.asyncio
async def test_register_rejects_private_webhook_url(api_client):
    resp = await api_client.post(
        "/api/v1/webhooks",
        json={
            "url": "http://localhost:9999/hook",
            "events": [WebhookEvent.JOB_COMPLETED],
        },
    )
    assert resp.status_code == 400
