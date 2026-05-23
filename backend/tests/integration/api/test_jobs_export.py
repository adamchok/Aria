"""GET /api/v1/jobs/{id}/export — Excel stream."""

from __future__ import annotations

import io
from pathlib import Path

import openpyxl
import pytest


@pytest.mark.asyncio
async def test_export_returns_xlsx_stream(api_client, fixtures_dir: Path):
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
    resp = await api_client.get(f"/api/v1/jobs/{job_id}/export")
    assert resp.status_code == 200
    assert "spreadsheetml" in resp.headers["content-type"]
    wb = openpyxl.load_workbook(io.BytesIO(resp.content))
    assert {"Summary", "Matched", "Exceptions", "Audit Log"} <= set(wb.sheetnames)
