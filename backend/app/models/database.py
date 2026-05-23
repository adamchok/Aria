"""SQLAlchemy ORM models for persistent state."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import JobStatus, MatchStatus


def _uuid_pk() -> Mapped[UUID]:
    return mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))


def _utcnow() -> datetime:
    return datetime.utcnow()


class JobORM(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    status: Mapped[JobStatus] = mapped_column(Enum(JobStatus), default=JobStatus.PENDING)
    progress_pct: Mapped[float] = mapped_column(default=0.0)
    agents_completed: Mapped[list[str]] = mapped_column(JSON, default=list)
    base_currency: Mapped[str] = mapped_column(String(3), default="MYR")
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_proof_keys: Mapped[list[str]] = mapped_column(JSON, default=list)
    bank_statement_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    report_blob: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)

    matches: Mapped[list[MatchORM]] = relationship(
        back_populates="job", cascade="all, delete-orphan", lazy="selectin"
    )
    audit_logs: Mapped[list[AuditLogORM]] = relationship(
        back_populates="job", cascade="all, delete-orphan", lazy="selectin"
    )


class MatchORM(Base):
    __tablename__ = "matches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    status: Mapped[MatchStatus] = mapped_column(Enum(MatchStatus))
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

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), index=True)
    agent: Mapped[str] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(128))
    confidence: Mapped[float | None] = mapped_column(nullable=True)
    reasoning: Mapped[str] = mapped_column(Text, default="")
    input_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    output_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, index=True)

    job: Mapped[JobORM] = relationship(back_populates="audit_logs")
