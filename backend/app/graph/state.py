"""Pipeline state — typed, Pydantic-backed."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import JobStatus
from app.models.schemas import (
    AuditLogEntry,
    BankStatement,
    MatchResult,
    NormalisedRecord,
    PaymentRecord,
    ReconciliationReport,
)


class DocumentInput(BaseModel):
    """One uploaded document, resolved against the storage layer."""

    storage_key: str
    filename: str
    content_type: str | None = None
    # Lazily filled by the ingestion node — bytes are kept off the durable state
    # representation but live on the in-memory state.
    bytes_data: bytes | None = Field(default=None, exclude=True)


class ReconciliationState(BaseModel):
    """Shared state passed through the reconciliation pipeline."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    job_id: UUID
    status: JobStatus = JobStatus.PENDING
    base_currency: str = "MYR"

    # Inputs
    payment_documents: list[DocumentInput] = Field(default_factory=list)
    bank_statement_input: DocumentInput | None = None
    # Set when using a pre-uploaded ledger statement instead of a file.
    bank_statement_id: UUID | None = None

    # Per-agent outputs
    payment_records: list[PaymentRecord] = Field(default_factory=list)
    bank_statement: BankStatement | None = None
    normalised_records: list[NormalisedRecord] = Field(default_factory=list)
    match_results: list[MatchResult] = Field(default_factory=list)
    report: ReconciliationReport | None = None

    # Bookkeeping
    agents_completed: list[str] = Field(default_factory=list)
    audit_log: list[AuditLogEntry] = Field(default_factory=list)
    error: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None

    def with_status(self, status: JobStatus) -> "ReconciliationState":
        self.status = status
        return self
