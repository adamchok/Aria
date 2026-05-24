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

from app.models.enums import BufferStatus, JobStatus, MatchStatus, ReviewAction, SourceFormat, UserRole, WebhookEvent

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


# ─── Job list ────────────────────────────────────────────────────────────────

class JobListItem(_Base):
    job_id: UUID
    status: JobStatus
    progress_pct: float
    base_currency: str
    record_count: int = 0
    matched_count: int = 0
    uncertain_count: int = 0
    unmatched_count: int = 0
    created_at: datetime
    updated_at: datetime


class JobListResponse(_Base):
    items: list[JobListItem]
    total: int
    page: int
    page_size: int


# ─── Tenant / API key ────────────────────────────────────────────────────────

class TenantCreate(_Base):
    name: str = Field(min_length=1, max_length=255)


class TenantResponse(_Base):
    id: UUID
    name: str
    created_at: datetime


class ApiKeyCreate(_Base):
    label: str = Field(default="", max_length=255)
    expires_at: datetime | None = None


class ApiKeyResponse(_Base):
    id: UUID
    tenant_id: UUID
    label: str
    last_used_at: datetime | None = None
    expires_at: datetime | None = None
    enabled: bool
    created_at: datetime
    key: str | None = None  # only populated on creation, never returned again


# ─── Transaction ingestion ────────────────────────────────────────────────────

class TransactionIngestItem(_Base):
    payment_proof_b64: str | None = None
    storage_key: str | None = None
    bank_entry: "BankEntry | None" = None
    corridor: str = Field(description="e.g. 'USD/MYR'")
    value_date: date

    @field_validator("corridor")
    @classmethod
    def _upper_corridor(cls, v: str) -> str:
        return v.upper()


class TransactionIngestRequest(_Base):
    transactions: list[TransactionIngestItem] = Field(min_length=1, max_length=200)


class TransactionIngestResponse(_Base):
    buffered: int
    tenant_id: UUID


class QueueCorridorStatus(_Base):
    corridor: str
    buffered_count: int
    oldest_received_at: datetime | None = None


class QueueStatusResponse(_Base):
    tenant_id: UUID
    total_buffered: int
    by_corridor: list[QueueCorridorStatus]
    next_batch_trigger: str  # "count" | "time" | "both" | "none"


# ─── Webhooks ────────────────────────────────────────────────────────────────

class WebhookCreate(_Base):
    url: str = Field(min_length=8, max_length=2048)
    events: list[str] = Field(min_length=1)
    label: str = Field(default="", max_length=255)


class WebhookResponse(_Base):
    id: UUID
    tenant_id: UUID
    url: str
    events: list[str]
    label: str
    enabled: bool
    created_at: datetime
    secret: str | None = None  # only on creation


class WebhookDeliveryResponse(_Base):
    id: UUID
    webhook_id: UUID
    job_id: UUID
    event: str
    status: str
    attempt_count: int
    last_attempt_at: datetime | None = None
    response_code: int | None = None
    created_at: datetime


# ─── Bank statement ledger ───────────────────────────────────────────────────

class BankStatementUploadResponse(_Base):
    id: UUID
    filename: str
    entry_count: int
    account_id: UUID | None = None
    statement_period_start: date | None = None
    statement_period_end: date | None = None


class BankEntryItem(_Base):
    id: UUID
    value_date: date
    amount: Decimal
    currency: str
    description: str = ""
    reference: str | None = None
    counterparty: str | None = None
    cleared: bool = False


class BankStatementSummary(_Base):
    id: UUID
    tenant_id: UUID | None = None
    filename: str
    base_currency: str
    statement_period_start: date | None = None
    statement_period_end: date | None = None
    entry_count: int
    uncleared_count: int
    created_at: datetime


class BankStatementDetail(_Base):
    id: UUID
    tenant_id: UUID | None = None
    filename: str
    base_currency: str
    statement_period_start: date | None = None
    statement_period_end: date | None = None
    entry_count: int
    uncleared_count: int
    created_at: datetime
    entries: list[BankEntryItem] = Field(default_factory=list)


# ─── Bank accounts ───────────────────────────────────────────────────────────

class BankAccountCreate(_Base):
    name: str = Field(min_length=1, max_length=255)
    bank_name: str = Field(min_length=1, max_length=255)
    account_number_masked: str = Field(min_length=1, max_length=50)
    currency: str = Field(min_length=3, max_length=3, description="ISO 4217")

    @field_validator("currency")
    @classmethod
    def _upper_currency(cls, v: str) -> str:
        upper = v.strip().upper()
        if not upper.isalpha() or len(upper) != 3:
            raise ValueError("currency must be a 3-letter ISO 4217 code (e.g. MYR, USD)")
        return upper


class BankAccountResponse(_Base):
    id: UUID
    tenant_id: UUID | None = None
    name: str
    bank_name: str
    account_number_masked: str
    currency: str
    created_at: datetime
    statement_count: int = 0
    entry_count: int = 0
    uncleared_count: int = 0


class LedgerEntryItem(_Base):
    id: UUID
    statement_id: UUID
    statement_filename: str
    value_date: date
    amount: Decimal
    currency: str
    description: str = ""
    reference: str | None = None
    counterparty: str | None = None
    cleared: bool = False
    cleared_by_job_id: UUID | None = None


class LedgerEntryUpdate(_Base):
    value_date: date | None = None
    amount: Decimal | None = None
    currency: str | None = None
    description: str | None = None
    reference: str | None = None
    counterparty: str | None = None

    @field_validator("currency")
    @classmethod
    def _upper_currency(cls, v: str | None) -> str | None:
        if v is None:
            return None
        upper = v.strip().upper()
        if not upper.isalpha() or len(upper) != 3:
            raise ValueError("currency must be a 3-letter ISO 4217 code")
        return upper


class LedgerPageResponse(_Base):
    items: list[LedgerEntryItem]
    total: int
    page: int
    page_size: int


# ─── SSE event ───────────────────────────────────────────────────────────────

class SSEEvent(_Base):
    event: str
    data: dict[str, Any]


# ─── Analytics ───────────────────────────────────────────────────────────────

class AnalyticsCorridorBreakdown(_Base):
    corridor: str
    job_count: int
    record_count: int
    avg_match_rate: float


class AnalyticsSummary(_Base):
    tenant_id: UUID
    period_start: date
    period_end: date
    total_jobs: int
    total_records: int
    matched_records: int
    uncertain_records: int
    unmatched_records: int
    avg_match_rate: float
    avg_processing_seconds: float
    escalation_rate: float
    by_corridor: list[AnalyticsCorridorBreakdown]


class AdminTenantAnalytics(_Base):
    tenant_id: UUID
    tenant_name: str
    total_jobs: int
    total_records: int
    matched_records: int
    avg_match_rate: float
    escalation_rate: float


class AdminAnalyticsSummary(_Base):
    period_start: date
    period_end: date
    total_tenants: int
    total_jobs: int
    total_records: int
    matched_records: int
    uncertain_records: int
    unmatched_records: int
    avg_match_rate: float
    escalation_rate: float
    by_tenant: list[AdminTenantAnalytics]


class AdminQueueTenantStatus(_Base):
    tenant_id: UUID
    tenant_name: str
    total_buffered: int
    by_corridor: list[QueueCorridorStatus]
    next_batch_trigger: str


class AdminQueueStatusResponse(_Base):
    tenants: list[AdminQueueTenantStatus]
    total_buffered_system: int


# ─── User / auth ─────────────────────────────────────────────────────────────


class LoginRequest(_Base):
    email: str
    password: str


class UserResponse(_Base):
    id: UUID
    email: str
    role: UserRole
    tenant_id: UUID | None = None
    is_active: bool
    created_at: datetime


class LoginResponse(_Base):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class UserCreate(_Base):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = UserRole.TENANT_USER
    tenant_id: UUID | None = None


class TenantUserCreate(_Base):
    """Create a tenant_user within the authenticated tenant (mgmt app)."""

    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
