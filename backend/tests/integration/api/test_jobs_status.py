"""GET /api/v1/jobs/{id} — status polling."""

from __future__ import annotations

from pathlib import Path

import pytest


@pytest.mark.asyncio
async def test_status_after_inline_run_is_terminal(api_client, fixtures_dir: Path):
    proof = (fixtures_dir / "payment_proofs" / "usd_invoice.txt").read_bytes()
    statement = (fixtures_dir / "bank_statements" / "may_2026.csv").read_bytes()
    create = await api_client.post(
        "/api/v1/jobs",
        files={
            "payment_proofs": ("usd.png", proof, "image/png"),
            "bank_statement": ("may.csv", statement, "text/csv"),
        },
        data={"base_currency": "MYR"},
    )
    job_id = create.json()["job_id"]

    resp = await api_client.get(f"/api/v1/jobs/{job_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["job_id"] == job_id
    assert body["status"] in {"COMPLETED", "AWAITING_REVIEW", "FAILED"}
    assert body["progress_pct"] == 100.0
    assert "ingestion" in body["agents_completed"]


@pytest.mark.asyncio
async def test_status_unknown_job_404(api_client):
    resp = await api_client.get("/api/v1/jobs/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404
