"""SQLAlchemy ORM models for persistent state."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import JSON, Boolean, DateTime, Enum, Float, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import (
    BufferStatus,
    JobStatus,
    MatchStatus,
    WebhookDeliveryStatus,
)


def _uuid_str() -> str:
    return str(uuid4())


def _utcnow() -> datetime:
    return datetime.utcnow()


# ─── Auth / Tenancy ──────────────────────────────────────────────────────────


class TenantORM(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    jobs: Mapped[list[JobORM]] = relationship(back_populates="tenant", cascade="all, delete-orphan", lazy="noload")
    api_keys: Mapped[list[ApiKeyORM]] = relationship(back_populates="tenant", cascade="all, delete-orphan", lazy="noload")
    transaction_buffer: Mapped[list[TransactionBufferORM]] = relationship(back_populates="tenant", cascade="all, delete-orphan", lazy="noload")
    webhooks: Mapped[list[WebhookORM]] = relationship(back_populates="tenant", cascade="all, delete-orphan", lazy="noload")


class ApiKeyORM(Base):
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    tenant: Mapped[TenantORM] = relationship(back_populates="api_keys")


# ─── Core pipeline ───────────────────────────────────────────────────────────


class JobORM(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    tenant_id: Mapped[str | None] = mapped_column(ForeignKey("tenants.id", ondelete="SET NULL"), index=True, nullable=True)
    status: Mapped[JobStatus] = mapped_column(
        Enum(JobStatus, native_enum=False, length=32),
        default=JobStatus.PENDING,
    )
    progress_pct: Mapped[float] = mapped_column(default=0.0)
    agents_completed: Mapped[list[str]] = mapped_column(JSON, default=list)
    base_currency: Mapped[str] = mapped_column(String(3), default="MYR")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_proof_keys: Mapped[list[str]] = mapped_column(JSON, default=list)
    bank_statement_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    report_blob: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    tenant: Mapped[TenantORM | None] = relationship(back_populates="jobs")
    matches: Mapped[list[MatchORM]] = relationship(
        back_populates="job", cascade="all, delete-orphan", lazy="selectin"
    )
    audit_logs: Mapped[list[AuditLogORM]] = relationship(
        back_populates="job", cascade="all, delete-orphan", lazy="selectin"
    )
    webhook_deliveries: Mapped[list[WebhookDeliveryORM]] = relationship(
        back_populates="job", cascade="all, delete-orphan", lazy="noload"
    )


class MatchORM(Base):
    __tablename__ = "matches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    status: Mapped[MatchStatus] = mapped_column(
        Enum(MatchStatus, native_enum=False, length=32),
    )
    confidence: Mapped[float] = mapped_column(default=0.0)
    amount_variance_myr: Mapped[Decimal] = mapped_column(Numeric(20, 6), default=Decimal("0"))
    variance_explanation: Mapped[str] = mapped_column(Text, default="")
    reasoning_chain: Mapped[str] = mapped_column(Text, default="")
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    human_reviewed: Mapped[bool] = mapped_column(default=False)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    job: Mapped[JobORM] = relationship(back_populates="matches")


class AuditLogORM(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    tenant_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    agent: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(128))
    confidence: Mapped[float | None] = mapped_column(nullable=True)
    reasoning: Mapped[str] = mapped_column(Text, default="")
    input_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    output_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, index=True)

    job: Mapped[JobORM] = relationship(back_populates="audit_logs")


# ─── Ingestion buffer ────────────────────────────────────────────────────────


class TransactionBufferORM(Base):
    __tablename__ = "transaction_buffer"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    corridor: Mapped[str] = mapped_column(String(16), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, index=True)
    status: Mapped[BufferStatus] = mapped_column(
        Enum(BufferStatus, native_enum=False, length=16),
        default=BufferStatus.BUFFERED,
        index=True,
    )
    job_id: Mapped[str | None] = mapped_column(ForeignKey("jobs.id", ondelete="SET NULL"), nullable=True)

    tenant: Mapped[TenantORM] = relationship(back_populates="transaction_buffer")


# ─── Webhooks ────────────────────────────────────────────────────────────────


class WebhookORM(Base):
    __tablename__ = "webhooks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    tenant_id: Mapped[str] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), index=True, nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    events: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    secret_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    secret: Mapped[str] = mapped_column(Text, nullable=False, default="")
    label: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    tenant: Mapped[TenantORM] = relationship(back_populates="webhooks")
    deliveries: Mapped[list[WebhookDeliveryORM]] = relationship(
        back_populates="webhook", cascade="all, delete-orphan", lazy="noload"
    )


class WebhookDeliveryORM(Base):
    __tablename__ = "webhook_deliveries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    webhook_id: Mapped[str] = mapped_column(ForeignKey("webhooks.id", ondelete="CASCADE"), index=True, nullable=False)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True, nullable=False)
    event: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[WebhookDeliveryStatus] = mapped_column(
        Enum(WebhookDeliveryStatus, native_enum=False, length=16),
        default=WebhookDeliveryStatus.PENDING,
    )
    attempt_count: Mapped[int] = mapped_column(default=0)
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    response_code: Mapped[int | None] = mapped_column(nullable=True)
    response_body: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    webhook: Mapped[WebhookORM] = relationship(back_populates="deliveries")
    job: Mapped[JobORM] = relationship(back_populates="webhook_deliveries")
