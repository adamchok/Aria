"""GET /api/v1/jobs/{id}/results."""

from __future__ import annotations

from pathlib import Path

import pytest


@pytest.mark.asyncio
async def test_results_returns_report_after_completion(api_client, fixtures_dir: Path):
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
    resp = await api_client.get(f"/api/v1/jobs/{job_id}/results")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["job_id"] == job_id
    assert body["summary"]["total_records"] >= 1
    assert "narrative" in body
