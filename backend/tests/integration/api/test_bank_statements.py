"""Integration tests for /api/v1/bank-statements endpoints."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID, uuid4

import pytest

from app.models.schemas import BankEntry, BankStatement
from app.repositories.bank_ledger_repository import BankLedgerRepository
from tests.conftest import TEST_TENANT_ID

# Minimal CSV bank statement fixture.
_CSV_STATEMENT = (
    "Date,Amount,Description,Reference\n"
    "2026-05-01,1000.00,Payment from Acme,INV-001\n"
    "2026-05-15,2500.50,Wire transfer,INV-002\n"
).encode()

_CSV_MULTILINE = (
    "Date,Amount,Description,Reference\n"
    "2026-05-01,100.00,Entry A,REF-A\n"
    "2026-05-02,200.00,Entry B,REF-B\n"
    "2026-05-03,300.00,Entry C,REF-C\n"
).encode()


# ─── POST /api/v1/bank-statements ────────────────────────────────────────────

@pytest.mark.asyncio
async def test_upload_csv_returns_201(api_client):
    resp = await api_client.post(
        "/api/v1/bank-statements",
        files={"bank_statement": ("may_2026.csv", _CSV_STATEMENT, "text/csv")},
        data={"base_currency": "MYR"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert "id" in body
    UUID(body["id"])  # valid UUID
    assert body["filename"] == "may_2026.csv"
    assert body["entry_count"] == 2


@pytest.mark.asyncio
async def test_upload_rejects_image_format(api_client):
    resp = await api_client.post(
        "/api/v1/bank-statements",
        files={"bank_statement": ("screenshot.png", b"\x89PNG\r\n\x1a\n", "image/png")},
        data={"base_currency": "MYR"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_upload_rejects_invalid_currency(api_client):
    resp = await api_client.post(
        "/api/v1/bank-statements",
        files={"bank_statement": ("stmt.csv", _CSV_STATEMENT, "text/csv")},
        data={"base_currency": "INVALID"},
    )
    assert resp.status_code == 422
    assert "ISO 4217" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_upload_default_currency_is_myr(api_client):
    resp = await api_client.post(
        "/api/v1/bank-statements",
        files={"bank_statement": ("stmt.csv", _CSV_STATEMENT, "text/csv")},
    )
    assert resp.status_code == 201


# ─── GET /api/v1/bank-statements ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_returns_uploaded_statements(api_client):
    # Upload two statements
    for i in range(2):
        await api_client.post(
            "/api/v1/bank-statements",
            files={"bank_statement": (f"stmt_{i}.csv", _CSV_STATEMENT, "text/csv")},
            data={"base_currency": "MYR"},
        )

    resp = await api_client.get("/api/v1/bank-statements")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) >= 2
    for item in items:
        assert "id" in item
        assert "entry_count" in item
        assert "uncleared_count" in item


@pytest.mark.asyncio
async def test_list_tenant_isolation(api_client, db_session):
    """Statement created without tenant_id must NOT appear in tenant's list."""
    repo = BankLedgerRepository(db_session, tenant_id=None)  # no tenant
    stmt = BankStatement(
        base_currency="MYR",
        entries=[BankEntry(value_date=date(2026, 5, 1), amount=Decimal("100"), currency="MYR")],
    )
    await repo.create_statement(filename="other_tenant.csv", storage_key=None, base_currency="MYR", statement=stmt)

    resp = await api_client.get("/api/v1/bank-statements")
    assert resp.status_code == 200
    ids = [item["id"] for item in resp.json()]
    # The unscoped statement should not appear in the tenant's list
    # (all returned items must belong to TEST_TENANT_ID)
    for item in resp.json():
        assert item.get("tenant_id") == TEST_TENANT_ID


# ─── GET /api/v1/bank-statements/{id} ────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_detail_returns_entries(api_client):
    upload = await api_client.post(
        "/api/v1/bank-statements",
        files={"bank_statement": ("detail_test.csv", _CSV_STATEMENT, "text/csv")},
        data={"base_currency": "MYR"},
    )
    assert upload.status_code == 201
    stmt_id = upload.json()["id"]

    resp = await api_client.get(f"/api/v1/bank-statements/{stmt_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == stmt_id
    assert body["entry_count"] == 2
    assert len(body["entries"]) == 2
    for entry in body["entries"]:
        assert "id" in entry
        assert "value_date" in entry
        assert "amount" in entry
        assert entry["cleared"] is False


@pytest.mark.asyncio
async def test_get_detail_404_for_unknown(api_client):
    resp = await api_client.get(f"/api/v1/bank-statements/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_detail_404_for_other_tenant(api_client, db_session):
    """Statement belonging to another tenant returns 404."""
    repo = BankLedgerRepository(db_session, tenant_id="other-tenant-id")
    stmt = BankStatement(
        base_currency="MYR",
        entries=[BankEntry(value_date=date(2026, 5, 1), amount=Decimal("50"), currency="MYR")],
    )
    orm = await repo.create_statement(filename="other.csv", storage_key=None, base_currency="MYR", statement=stmt)

    resp = await api_client.get(f"/api/v1/bank-statements/{orm.id}")
    assert resp.status_code == 404


# ─── GET /api/v1/bank-statements/{id}/entries ────────────────────────────────

@pytest.mark.asyncio
async def test_entries_endpoint_returns_all_uncleared(api_client):
    upload = await api_client.post(
        "/api/v1/bank-statements",
        files={"bank_statement": ("entries_test.csv", _CSV_MULTILINE, "text/csv")},
        data={"base_currency": "MYR"},
    )
    assert upload.status_code == 201
    stmt_id = upload.json()["id"]

    resp = await api_client.get(f"/api/v1/bank-statements/{stmt_id}/entries")
    assert resp.status_code == 200
    entries = resp.json()
    assert len(entries) == 3
    assert all(e["cleared"] is False for e in entries)


@pytest.mark.asyncio
async def test_entries_cleared_filter(api_client, db_session):
    """After clearing an entry, filter by cleared=true returns only cleared entries."""
    upload = await api_client.post(
        "/api/v1/bank-statements",
        files={"bank_statement": ("filter_test.csv", _CSV_MULTILINE, "text/csv")},
        data={"base_currency": "MYR"},
    )
    assert upload.status_code == 201
    stmt_id = upload.json()["id"]

    # Get the first entry ID and clear it directly via the repository.
    repo = BankLedgerRepository(db_session, tenant_id=TEST_TENANT_ID)
    entries_orm = await repo.get_entries(stmt_id)
    first_entry_id = UUID(entries_orm[0].id)
    await repo.clear_entries([first_entry_id], job_id=uuid4())

    cleared_resp = await api_client.get(f"/api/v1/bank-statements/{stmt_id}/entries?cleared=true")
    assert cleared_resp.status_code == 200
    assert len(cleared_resp.json()) == 1
    assert cleared_resp.json()[0]["cleared"] is True

    uncleared_resp = await api_client.get(f"/api/v1/bank-statements/{stmt_id}/entries?cleared=false")
    assert uncleared_resp.status_code == 200
    assert len(uncleared_resp.json()) == 2
    assert all(e["cleared"] is False for e in uncleared_resp.json())


@pytest.mark.asyncio
async def test_entries_endpoint_404_for_unknown(api_client):
    resp = await api_client.get(f"/api/v1/bank-statements/{uuid4()}/entries")
    assert resp.status_code == 404
