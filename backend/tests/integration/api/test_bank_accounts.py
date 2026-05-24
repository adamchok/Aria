"""Integration tests for /api/v1/bank-accounts endpoints."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID, uuid4

import pytest

from app.models.schemas import BankEntry, BankStatement
from app.repositories.bank_account_repository import BankAccountRepository
from app.repositories.bank_ledger_repository import BankLedgerRepository
from tests.conftest import TEST_TENANT_ID

_CSV = (
    "Date,Amount,Description,Reference\n"
    "2026-05-01,1000.00,Payment from Acme,INV-001\n"
    "2026-05-15,2500.50,Wire transfer,INV-002\n"
).encode()

_CREATE_PAYLOAD = {
    "name": "Main Operating Account",
    "bank_name": "Maybank",
    "account_number_masked": "****1234",
    "currency": "MYR",
}


# ─── POST /api/v1/bank-accounts ───────────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_bank_account_returns_201(api_client):
    resp = await api_client.post("/api/v1/bank-accounts", json=_CREATE_PAYLOAD)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    UUID(body["id"])
    assert body["name"] == "Main Operating Account"
    assert body["bank_name"] == "Maybank"
    assert body["currency"] == "MYR"
    assert body["statement_count"] == 0
    assert body["uncleared_count"] == 0


@pytest.mark.asyncio
async def test_create_bank_account_upcases_currency(api_client):
    resp = await api_client.post(
        "/api/v1/bank-accounts",
        json={**_CREATE_PAYLOAD, "currency": "usd"},
    )
    assert resp.status_code == 201
    assert resp.json()["currency"] == "USD"


@pytest.mark.asyncio
async def test_create_rejects_invalid_currency(api_client):
    resp = await api_client.post(
        "/api/v1/bank-accounts",
        json={**_CREATE_PAYLOAD, "currency": "INVALID"},
    )
    assert resp.status_code == 422


# ─── GET /api/v1/bank-accounts ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_returns_own_accounts(api_client):
    for i in range(2):
        await api_client.post("/api/v1/bank-accounts", json={**_CREATE_PAYLOAD, "name": f"Account {i}"})

    resp = await api_client.get("/api/v1/bank-accounts")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) >= 2
    assert all("statement_count" in item for item in items)


@pytest.mark.asyncio
async def test_list_tenant_isolation(api_client, db_session):
    """Account created for a different tenant must not appear in our list."""
    other_repo = BankAccountRepository(db_session, tenant_id="other-tenant")
    await other_repo.create(
        name="Other Account", bank_name="HSBC",
        account_number_masked="****9999", currency="USD",
    )

    resp = await api_client.get("/api/v1/bank-accounts")
    assert resp.status_code == 200
    for item in resp.json():
        assert item["tenant_id"] == TEST_TENANT_ID


# ─── GET /api/v1/bank-accounts/{id} ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_account_returns_stats(api_client):
    create = await api_client.post("/api/v1/bank-accounts", json=_CREATE_PAYLOAD)
    acc_id = create.json()["id"]

    resp = await api_client.get(f"/api/v1/bank-accounts/{acc_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == acc_id


@pytest.mark.asyncio
async def test_get_account_404_for_unknown(api_client):
    resp = await api_client.get(f"/api/v1/bank-accounts/{uuid4()}")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_account_404_for_other_tenant(api_client, db_session):
    other_repo = BankAccountRepository(db_session, tenant_id="other-tenant")
    acc = await other_repo.create(
        name="Other", bank_name="HSBC", account_number_masked="****0000", currency="USD"
    )
    resp = await api_client.get(f"/api/v1/bank-accounts/{acc.id}")
    assert resp.status_code == 404


# ─── DELETE /api/v1/bank-accounts/{id} ───────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_account(api_client):
    create = await api_client.post("/api/v1/bank-accounts", json=_CREATE_PAYLOAD)
    acc_id = create.json()["id"]

    resp = await api_client.delete(f"/api/v1/bank-accounts/{acc_id}")
    assert resp.status_code == 204

    resp2 = await api_client.get(f"/api/v1/bank-accounts/{acc_id}")
    assert resp2.status_code == 404


@pytest.mark.asyncio
async def test_delete_404_for_unknown(api_client):
    resp = await api_client.delete(f"/api/v1/bank-accounts/{uuid4()}")
    assert resp.status_code == 404


# ─── POST /api/v1/bank-accounts/{id}/statements ───────────────────────────────

@pytest.mark.asyncio
async def test_upload_statement_to_account(api_client):
    create = await api_client.post("/api/v1/bank-accounts", json=_CREATE_PAYLOAD)
    acc_id = create.json()["id"]

    resp = await api_client.post(
        f"/api/v1/bank-accounts/{acc_id}/statements",
        files={"bank_statement": ("may_2026.csv", _CSV, "text/csv")},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["entry_count"] == 2
    assert body["account_id"] == acc_id


@pytest.mark.asyncio
async def test_upload_statement_uses_account_currency_by_default(api_client):
    create = await api_client.post(
        "/api/v1/bank-accounts", json={**_CREATE_PAYLOAD, "currency": "USD"}
    )
    acc_id = create.json()["id"]

    resp = await api_client.post(
        f"/api/v1/bank-accounts/{acc_id}/statements",
        files={"bank_statement": ("stmt.csv", _CSV, "text/csv")},
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_upload_statement_404_for_unknown_account(api_client):
    resp = await api_client.post(
        f"/api/v1/bank-accounts/{uuid4()}/statements",
        files={"bank_statement": ("stmt.csv", _CSV, "text/csv")},
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_upload_rejects_image_to_account(api_client):
    create = await api_client.post("/api/v1/bank-accounts", json=_CREATE_PAYLOAD)
    acc_id = create.json()["id"]
    resp = await api_client.post(
        f"/api/v1/bank-accounts/{acc_id}/statements",
        files={"bank_statement": ("screenshot.png", b"\x89PNG\r\n\x1a\n", "image/png")},
    )
    assert resp.status_code == 400


# ─── GET /api/v1/bank-accounts/{id}/statements ────────────────────────────────

@pytest.mark.asyncio
async def test_list_account_statements(api_client):
    create = await api_client.post("/api/v1/bank-accounts", json=_CREATE_PAYLOAD)
    acc_id = create.json()["id"]

    for _ in range(2):
        await api_client.post(
            f"/api/v1/bank-accounts/{acc_id}/statements",
            files={"bank_statement": ("stmt.csv", _CSV, "text/csv")},
        )

    resp = await api_client.get(f"/api/v1/bank-accounts/{acc_id}/statements")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


@pytest.mark.asyncio
async def test_list_statements_404_for_unknown_account(api_client):
    resp = await api_client.get(f"/api/v1/bank-accounts/{uuid4()}/statements")
    assert resp.status_code == 404


# ─── GET /api/v1/bank-accounts/{id}/ledger ────────────────────────────────────

@pytest.mark.asyncio
async def test_ledger_returns_all_entries(api_client):
    create = await api_client.post("/api/v1/bank-accounts", json=_CREATE_PAYLOAD)
    acc_id = create.json()["id"]
    await api_client.post(
        f"/api/v1/bank-accounts/{acc_id}/statements",
        files={"bank_statement": ("stmt.csv", _CSV, "text/csv")},
    )

    resp = await api_client.get(f"/api/v1/bank-accounts/{acc_id}/ledger")
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2
    for item in body["items"]:
        assert "value_date" in item
        assert "amount" in item
        assert item["cleared"] is False
        assert "statement_filename" in item


@pytest.mark.asyncio
async def test_ledger_across_multiple_statements(api_client):
    create = await api_client.post("/api/v1/bank-accounts", json=_CREATE_PAYLOAD)
    acc_id = create.json()["id"]

    # Upload two statements — 4 entries total
    for _ in range(2):
        await api_client.post(
            f"/api/v1/bank-accounts/{acc_id}/statements",
            files={"bank_statement": ("stmt.csv", _CSV, "text/csv")},
        )

    resp = await api_client.get(f"/api/v1/bank-accounts/{acc_id}/ledger")
    assert resp.json()["total"] == 4


@pytest.mark.asyncio
async def test_ledger_cleared_filter(api_client, db_session):
    create = await api_client.post("/api/v1/bank-accounts", json=_CREATE_PAYLOAD)
    acc_id = create.json()["id"]
    stmt_resp = await api_client.post(
        f"/api/v1/bank-accounts/{acc_id}/statements",
        files={"bank_statement": ("stmt.csv", _CSV, "text/csv")},
    )
    stmt_id = stmt_resp.json()["id"]

    # Clear one entry directly via repository.
    ledger_repo = BankLedgerRepository(db_session, tenant_id=TEST_TENANT_ID)
    entries = await ledger_repo.get_entries(stmt_id)
    await ledger_repo.clear_entries([UUID(entries[0].id)], job_id=uuid4())

    cleared_resp = await api_client.get(f"/api/v1/bank-accounts/{acc_id}/ledger?cleared=true")
    assert cleared_resp.status_code == 200
    assert cleared_resp.json()["total"] == 1

    uncleared_resp = await api_client.get(f"/api/v1/bank-accounts/{acc_id}/ledger?cleared=false")
    assert uncleared_resp.status_code == 200
    assert uncleared_resp.json()["total"] == 1


@pytest.mark.asyncio
async def test_ledger_pagination(api_client):
    create = await api_client.post("/api/v1/bank-accounts", json=_CREATE_PAYLOAD)
    acc_id = create.json()["id"]

    big_csv = ("Date,Amount,Description\n" + "\n".join(
        f"2026-05-{i + 1:02d},{i * 10 + 100}.00,Entry {i}" for i in range(10)
    )).encode()

    await api_client.post(
        f"/api/v1/bank-accounts/{acc_id}/statements",
        files={"bank_statement": ("stmt.csv", big_csv, "text/csv")},
    )

    page1 = await api_client.get(f"/api/v1/bank-accounts/{acc_id}/ledger?page=1&page_size=5")
    page2 = await api_client.get(f"/api/v1/bank-accounts/{acc_id}/ledger?page=2&page_size=5")
    assert page1.json()["total"] == 10
    assert len(page1.json()["items"]) == 5
    assert len(page2.json()["items"]) == 5


@pytest.mark.asyncio
async def test_ledger_404_for_unknown_account(api_client):
    resp = await api_client.get(f"/api/v1/bank-accounts/{uuid4()}/ledger")
    assert resp.status_code == 404


# ─── Stats reflected in account response ─────────────────────────────────────

@pytest.mark.asyncio
async def test_account_stats_update_after_upload(api_client):
    create = await api_client.post("/api/v1/bank-accounts", json=_CREATE_PAYLOAD)
    acc_id = create.json()["id"]

    detail_before = await api_client.get(f"/api/v1/bank-accounts/{acc_id}")
    assert detail_before.json()["entry_count"] == 0

    await api_client.post(
        f"/api/v1/bank-accounts/{acc_id}/statements",
        files={"bank_statement": ("stmt.csv", _CSV, "text/csv")},
    )

    detail_after = await api_client.get(f"/api/v1/bank-accounts/{acc_id}")
    assert detail_after.json()["entry_count"] == 2
    assert detail_after.json()["uncleared_count"] == 2
    assert detail_after.json()["statement_count"] == 1
