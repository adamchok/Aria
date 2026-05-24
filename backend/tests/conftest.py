"""Shared pytest fixtures for ARIA backend tests."""

from __future__ import annotations

import asyncio
import os
import tempfile
from collections.abc import AsyncIterator, Iterator
from datetime import date
from decimal import Decimal
from pathlib import Path

# Tests use SQLite + local storage so no external services are required.
# FX keys are FORCED empty so tests use the deterministic static fallback
# regardless of what's in the developer's .env file.
os.environ["APP_ENV"] = "test"
os.environ["LLM_MODE"] = "mock"
os.environ["EXCHANGERATE_API_KEY"] = ""
os.environ["OPENEXCHANGERATES_APP_ID"] = ""
os.environ["ADMIN_API_KEY"] = "test-admin-key"
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./_test_aria.db")
os.environ.setdefault("S3_ENDPOINT", f"local://{tempfile.mkdtemp(prefix='aria_test_')}")
os.environ.setdefault("CELERY_TASK_ALWAYS_EAGER", "1")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")

# Fixed test credentials — seeded into the in-memory DB by api_client fixture.
TEST_TENANT_ID = "00000000-0000-0000-0001-000000000001"
TEST_RAW_API_KEY = "aria_testkey_integration"
TEST_ADMIN_EMAIL = "admin@aria.test"
TEST_ADMIN_PASSWORD = "adminpass123"
TEST_TENANT_USER_EMAIL = "user@tenant.test"
TEST_TENANT_USER_PASSWORD = "userpass123"

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.core.database import Base
from app.models import database as _orm_models  # registers all ORM classes with Base.metadata
from app.models.enums import SourceFormat
from app.models.schemas import (
    BankEntry,
    BankStatement,
    NormalisedRecord,
    PaymentRecord,
)


@pytest.fixture(scope="session")
def settings():
    get_settings.cache_clear()
    return get_settings()


@pytest_asyncio.fixture
async def db_engine():
    """Fresh in-memory SQLite engine per test."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def db_session(db_engine) -> AsyncIterator[AsyncSession]:
    factory = async_sessionmaker(db_engine, expire_on_commit=False, class_=AsyncSession)
    async with factory() as session:
        yield session


@pytest_asyncio.fixture
async def api_client(db_engine):
    """ASGI client wired to the in-memory test DB with a pre-seeded tenant + API key."""
    from app.core import database as db_module
    from app.core.dependencies import get_db_session
    from app.core.security import hash_key, hash_password
    from app.main import app
    from app.models.database import ApiKeyORM, TenantORM, UserORM
    from app.models.enums import UserRole

    test_factory = async_sessionmaker(
        db_engine, expire_on_commit=False, class_=AsyncSession
    )

    # Rebind the module-level factory so the auth middleware and pipeline_runner
    # (which use session_scope()) both see the same in-memory test DB.
    original_factory = db_module._session_factory
    db_module._session_factory = test_factory

    # Seed a tenant + API key so the auth middleware can validate the test key.
    async with test_factory() as s:
        s.add(TenantORM(id=TEST_TENANT_ID, name="Test Tenant"))
        s.add(ApiKeyORM(
            tenant_id=TEST_TENANT_ID,
            key_hash=hash_key(TEST_RAW_API_KEY),
            label="test",
            enabled=True,
        ))
        s.add(UserORM(
            email=TEST_ADMIN_EMAIL,
            hashed_password=hash_password(TEST_ADMIN_PASSWORD),
            role=UserRole.ADMIN,
            tenant_id=None,
        ))
        s.add(UserORM(
            email=TEST_TENANT_USER_EMAIL,
            hashed_password=hash_password(TEST_TENANT_USER_PASSWORD),
            role=UserRole.TENANT_USER,
            tenant_id=TEST_TENANT_ID,
        ))
        await s.commit()

    async def _override_session():
        async with test_factory() as s:
            yield s

    app.dependency_overrides[get_db_session] = _override_session

    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"X-API-Key": TEST_RAW_API_KEY},
    ) as client:
        yield client

    app.dependency_overrides.clear()
    db_module._session_factory = original_factory


@pytest_asyncio.fixture
async def jwt_admin_client(api_client):
    """API client authenticated with platform admin JWT."""
    resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": TEST_ADMIN_EMAIL, "password": TEST_ADMIN_PASSWORD},
    )
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    api_client.headers["Authorization"] = f"Bearer {token}"
    api_client.headers.pop("X-API-Key", None)
    return api_client


@pytest_asyncio.fixture
async def jwt_tenant_client(api_client):
    """API client authenticated with tenant user JWT."""
    resp = await api_client.post(
        "/api/v1/auth/login",
        json={"email": TEST_TENANT_USER_EMAIL, "password": TEST_TENANT_USER_PASSWORD},
    )
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    api_client.headers["Authorization"] = f"Bearer {token}"
    api_client.headers.pop("X-API-Key", None)
    return api_client


# ─── Reusable schema fixtures ──────────────────────────────────────────────


@pytest.fixture
def payment_record_usd() -> PaymentRecord:
    return PaymentRecord(
        payer="Acme US Inc",
        payee="ARIA Demo SDN BHD",
        amount_original=Decimal("10.00"),
        currency="USD",
        value_date=date(2026, 5, 18),
        reference="INV-001",
        bank_charges=None,
        source_format=SourceFormat.IMAGE,
        extraction_confidence=0.92,
        raw_extracted_text="USD 10.00 invoice",
        field_confidences={"amount_original": 0.95, "currency": 0.99},
    )


@pytest.fixture
def normalised_record_usd(payment_record_usd: PaymentRecord) -> NormalisedRecord:
    return NormalisedRecord(
        payment=payment_record_usd,
        amount_myr_at_invoice_rate=Decimal("42.30"),
        amount_myr_at_settlement_rate=Decimal("42.55"),
        fx_rate_invoice=Decimal("4.230"),
        fx_rate_settlement=Decimal("4.255"),
        tolerance_low=Decimal("41.10"),
        tolerance_high=Decimal("43.20"),
        estimated_charges_myr=Decimal("0.50"),
        base_currency="MYR",
    )


@pytest.fixture
def bank_entry_myr() -> BankEntry:
    return BankEntry(
        value_date=date(2026, 5, 20),
        amount=Decimal("42.30"),
        currency="MYR",
        description="Inward Telegraphic Transfer Acme US Inc",
        reference="INV-001",
        counterparty="ACME US INC",
    )


@pytest.fixture
def bank_statement(bank_entry_myr) -> BankStatement:
    return BankStatement(
        base_currency="MYR",
        entries=[bank_entry_myr],
        statement_period_start=date(2026, 5, 1),
        statement_period_end=date(2026, 5, 31),
    )


@pytest.fixture
def fixtures_dir() -> Path:
    return Path(__file__).parent / "fixtures"
