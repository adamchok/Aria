"""POST /api/v1/jobs — multipart upload, validation, pipeline trigger."""

from __future__ import annotations

from pathlib import Path

import pytest


def _files(fixtures_dir: Path):
    proof = fixtures_dir / "payment_proofs" / "usd_invoice.txt"
    statement = fixtures_dir / "bank_statements" / "may_2026.csv"
    return {
        "payment_proofs": ("usd_invoice.png", proof.read_bytes(), "image/png"),
        "bank_statement": ("may_2026.csv", statement.read_bytes(), "text/csv"),
    }


@pytest.mark.asyncio
async def test_create_job_returns_id_and_runs_inline(api_client, fixtures_dir: Path):
    files = _files(fixtures_dir)
    resp = await api_client.post(
        "/api/v1/jobs",
        files={
            "payment_proofs": files["payment_proofs"],
            "bank_statement": files["bank_statement"],
        },
        data={"base_currency": "MYR"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert "job_id" in body
    assert body["status"] in {"PENDING", "INGESTING", "COMPLETED", "AWAITING_REVIEW"}


@pytest.mark.asyncio
async def test_create_job_rejects_missing_bank_statement(api_client, fixtures_dir: Path):
    files = _files(fixtures_dir)
    resp = await api_client.post(
        "/api/v1/jobs",
        files={"payment_proofs": files["payment_proofs"]},
        data={"base_currency": "MYR"},
    )
    assert resp.status_code == 422  # FastAPI validation error for missing field
