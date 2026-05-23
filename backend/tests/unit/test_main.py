"""Smoke tests for the FastAPI entry point."""

from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_health_endpoint(api_client):
    resp = await api_client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["env"] == "test"


@pytest.mark.asyncio
async def test_openapi_schema_loads(api_client):
    resp = await api_client.get("/openapi.json")
    assert resp.status_code == 200
    schema = resp.json()
    paths = schema["paths"]
    assert "/api/v1/jobs" in paths
    assert "/api/v1/jobs/{job_id}" in paths
    assert "/api/v1/jobs/{job_id}/results" in paths
    assert "/api/v1/jobs/{job_id}/review" in paths
    assert "/api/v1/jobs/{job_id}/review/{match_id}" in paths
    assert "/api/v1/jobs/{job_id}/export" in paths


@pytest.mark.asyncio
async def test_cors_preflight(api_client):
    resp = await api_client.options(
        "/api/v1/jobs",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert resp.status_code in {200, 204}
    assert "access-control-allow-origin" in {h.lower() for h in resp.headers}
