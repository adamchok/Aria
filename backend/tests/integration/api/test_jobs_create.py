"""POST /api/v1/jobs — multipart upload, validation, pipeline trigger."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest

from app.models.schemas import BankStatement, BankEntry
from app.repositories.bank_ledger_repository import BankLedgerRepository
from tests.conftest import TEST_TENANT_ID

from datetime import date
from decimal import Decimal


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
async def test_create_job_accepts_pdf_bank_statement(api_client, fixtures_dir: Path):
    files = _files(fixtures_dir)
    resp = await api_client.post(
        "/api/v1/jobs",
        files={
            "payment_proofs": files["payment_proofs"],
            "bank_statement": ("statement.pdf", b"%PDF-1.4", "application/pdf"),
        },
        data={"base_currency": "MYR"},
    )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_create_job_rejects_missing_bank_statement(api_client, fixtures_dir: Path):
    files = _files(fixtures_dir)
    resp = await api_client.post(
        "/api/v1/jobs",
        files={"payment_proofs": files["payment_proofs"]},
        data={"base_currency": "MYR"},
    )
    assert resp.status_code == 400  # App-level validation: bank_statement or bank_statement_id required


@pytest.mark.asyncio
async def test_create_job_rejects_invalid_currency(api_client, fixtures_dir: Path):
    files = _files(fixtures_dir)
    resp = await api_client.post(
        "/api/v1/jobs",
        files={
            "payment_proofs": files["payment_proofs"],
            "bank_statement": files["bank_statement"],
        },
        data={"base_currency": "INVALID"},
    )
    assert resp.status_code == 422
    assert "ISO 4217" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_create_job_rejects_both_statement_and_id(api_client, fixtures_dir: Path):
    files = _files(fixtures_dir)
    resp = await api_client.post(
        "/api/v1/jobs",
        files={
            "payment_proofs": files["payment_proofs"],
            "bank_statement": files["bank_statement"],
        },
        data={"base_currency": "MYR", "bank_statement_id": str(uuid4())},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_create_job_rejects_invalid_uuid_for_statement_id(api_client, fixtures_dir: Path):
    files = _files(fixtures_dir)
    resp = await api_client.post(
        "/api/v1/jobs",
        files={"payment_proofs": files["payment_proofs"]},
        data={"base_currency": "MYR", "bank_statement_id": "not-a-uuid"},
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_job_rejects_nonexistent_statement_id(api_client, fixtures_dir: Path):
    files = _files(fixtures_dir)
    resp = await api_client.post(
        "/api/v1/jobs",
        files={"payment_proofs": files["payment_proofs"]},
        data={"base_currency": "MYR", "bank_statement_id": str(uuid4())},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_create_job_accepts_valid_statement_id(api_client, db_session, fixtures_dir: Path):
    """Job creation succeeds when bank_statement_id references an existing ledger statement."""
    repo = BankLedgerRepository(db_session, tenant_id=TEST_TENANT_ID)
    stmt = BankStatement(
        base_currency="MYR",
        entries=[BankEntry(value_date=date(2026, 5, 1), amount=Decimal("100"), currency="MYR")],
    )
    orm = await repo.create_statement(filename="ledger.csv", storage_key=None, base_currency="MYR", statement=stmt)

    files = _files(fixtures_dir)
    resp = await api_client.post(
        "/api/v1/jobs",
        files={"payment_proofs": files["payment_proofs"]},
        data={"base_currency": "MYR", "bank_statement_id": orm.id},
    )
    assert resp.status_code == 201, resp.text


@pytest.mark.asyncio
async def test_create_job_rejects_other_tenant_statement_id(api_client, db_session, fixtures_dir: Path):
    """bank_statement_id belonging to a different tenant must return 404."""
    repo_other = BankLedgerRepository(db_session, tenant_id="other-tenant")
    stmt = BankStatement(
        base_currency="MYR",
        entries=[BankEntry(value_date=date(2026, 5, 1), amount=Decimal("50"), currency="MYR")],
    )
    orm = await repo_other.create_statement(
        filename="other.csv", storage_key=None, base_currency="MYR", statement=stmt
    )

    files = _files(fixtures_dir)
    resp = await api_client.post(
        "/api/v1/jobs",
        files={"payment_proofs": files["payment_proofs"]},
        data={"base_currency": "MYR", "bank_statement_id": orm.id},
    )
    assert resp.status_code == 404
