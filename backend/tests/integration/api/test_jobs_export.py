"""GET /api/v1/jobs/{id}/export — Excel stream."""

from __future__ import annotations

import io
from pathlib import Path

import openpyxl
import pytest

from app.models.enums import JobStatus
from app.repositories.job_repository import JobRepository


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


@pytest.mark.asyncio
async def test_export_404_for_other_tenant_job(api_client, db_session):
    """Jobs belonging to another tenant must not be exportable."""
    other_repo = JobRepository(db_session, tenant_id="other-tenant")
    job = await other_repo.create_job(
        base_currency="MYR",
        payment_proof_keys=["proofs/other.png"],
        bank_statement_key="statements/other.csv",
        tenant_id="other-tenant",
    )
    await other_repo.update_status(job.id, status=JobStatus.COMPLETED)
    await other_repo.save_report(job.id, {"summary": {"total_records": 0}})

    resp = await api_client.get(f"/api/v1/jobs/{job.id}/export")
    assert resp.status_code == 404
