"""Pydantic schemas — the API and agent-state contract.

Decimal is used for all monetary fields. JSON serialisation emits strings to
preserve precision across the boundary; consumers should parse back to Decimal.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator

from app.models.enums import JobStatus, MatchStatus, ReviewAction, SourceFormat

MoneyStr = Annotated[Decimal, Field(..., description="Decimal amount; JSON-encoded as string")]


class _Base(BaseModel):
    model_config = ConfigDict(
        validate_assignment=True,
        populate_by_name=True,
    )

    @field_serializer("*", when_used="json")
    def _serialise(self, value: Any) -> Any:  # type: ignore[override]
        if isinstance(value, Decimal):
            return str(value)
        return value


class PaymentRecord(_Base):
    id: UUID = Field(default_factory=uuid4)
    payer: str
    payee: str
    amount_original: Decimal
    currency: str = Field(min_length=3, max_length=3, description="ISO 4217")
    value_date: date
    reference: str | None = None
    bank_charges: Decimal | None = None
    source_format: SourceFormat
    extraction_confidence: float = Field(ge=0.0, le=1.0)
    raw_extracted_text: str = ""
    field_confidences: dict[str, float] = Field(default_factory=dict)
    source_document: str | None = Field(default=None, description="Storage key for the source file")

    @field_validator("currency")
    @classmethod
    def _upper_currency(cls, v: str) -> str:
        return v.upper()


class NormalisedRecord(_Base):
    payment: PaymentRecord
    amount_myr_at_invoice_rate: Decimal
    amount_myr_at_settlement_rate: Decimal
    fx_rate_invoice: Decimal
    fx_rate_settlement: Decimal
    tolerance_low: Decimal
    tolerance_high: Decimal
    estimated_charges_myr: Decimal
    base_currency: str = "MYR"


class BankEntry(_Base):
    id: UUID = Field(default_factory=uuid4)
    value_date: date
    amount: Decimal
    currency: str = "MYR"
    description: str = ""
    reference: str | None = None
    counterparty: str | None = None
    raw_row: dict[str, Any] = Field(default_factory=dict)

    @field_validator("currency")
    @classmethod
    def _upper_currency(cls, v: str) -> str:
        return v.upper()


class BankStatement(_Base):
    base_currency: str = "MYR"
    entries: list[BankEntry] = Field(default_factory=list)
    statement_period_start: date | None = None
    statement_period_end: date | None = None


class CandidateScore(_Base):
    bank_entry_id: UUID
    amount_match_score: float
    date_proximity_score: float
    reference_similarity_score: float
    payer_name_score: float
    composite: float


class MatchResult(_Base):
    id: UUID = Field(default_factory=uuid4)
    normalised_record: NormalisedRecord
    bank_entry: BankEntry | None = None
    candidate_scores: list[CandidateScore] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    status: MatchStatus
    amount_variance_myr: Decimal = Decimal("0")
    variance_explanation: str = ""
    reasoning_chain: str = ""
    human_reviewed: bool = False
    review_notes: str | None = None


class ReconciliationSummary(_Base):
    total_records: int
    matched_count: int
    uncertain_count: int
    unmatched_count: int
    total_value_myr: Decimal
    matched_value_myr: Decimal
    total_variance_myr: Decimal
    processing_seconds: float


class ReconciliationReport(_Base):
    job_id: UUID
    summary: ReconciliationSummary
    matches: list[MatchResult] = Field(default_factory=list)
    generated_at: datetime
    base_currency: str = "MYR"
    narrative: str = ""


class AuditLogEntry(_Base):
    id: UUID = Field(default_factory=uuid4)
    job_id: UUID
    agent: str
    action: str
    input_snapshot: dict[str, Any] = Field(default_factory=dict)
    output_snapshot: dict[str, Any] = Field(default_factory=dict)
    reasoning: str = ""
    confidence: float | None = None
    timestamp: datetime


# ─── API request / response shapes ──────────────────────────────────────────

class JobCreateResponse(_Base):
    job_id: UUID
    status: JobStatus
    created_at: datetime


class JobStatusResponse(_Base):
    job_id: UUID
    status: JobStatus
    progress_pct: float
    agents_completed: list[str]
    error: str | None = None
    created_at: datetime
    updated_at: datetime


class ReviewActionRequest(_Base):
    action: ReviewAction
    bank_entry_id: UUID | None = None
    note: str | None = None


class ReviewActionResponse(_Base):
    match_id: UUID
    status: MatchStatus
    human_reviewed: bool = True
    note: str | None = None
