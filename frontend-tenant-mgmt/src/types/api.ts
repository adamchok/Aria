/**
 * Types mirroring the backend Pydantic schemas in `backend/app/models/schemas.py`.
 * Monetary fields are encoded as strings to preserve Decimal precision across
 * the JSON boundary — never coerce to `number` for arithmetic, only for display.
 */

export type UUID = string;
export type ISODate = string; // YYYY-MM-DD
export type ISODateTime = string;
export type MoneyStr = string;

export const JobStatus = {
  PENDING: 'PENDING',
  INGESTING: 'INGESTING',
  NORMALISING: 'NORMALISING',
  MATCHING: 'MATCHING',
  REPORTING: 'REPORTING',
  AWAITING_REVIEW: 'AWAITING_REVIEW',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const MatchStatus = {
  MATCHED: 'MATCHED',
  UNCERTAIN: 'UNCERTAIN',
  UNMATCHED: 'UNMATCHED',
} as const;
export type MatchStatus = (typeof MatchStatus)[keyof typeof MatchStatus];

export const ReviewAction = {
  CONFIRM: 'confirm',
  REJECT: 'reject',
  MANUAL_MATCH: 'manual_match',
} as const;
export type ReviewAction = (typeof ReviewAction)[keyof typeof ReviewAction];

export const SourceFormat = {
  IMAGE: 'IMAGE',
  PDF: 'PDF',
  EXCEL: 'EXCEL',
  CSV: 'CSV',
} as const;
export type SourceFormat = (typeof SourceFormat)[keyof typeof SourceFormat];

export interface PaymentRecord {
  id: UUID;
  payer: string;
  payee: string;
  amount_original: MoneyStr;
  currency: string;
  value_date: ISODate;
  reference: string | null;
  bank_charges: MoneyStr | null;
  source_format: SourceFormat;
  extraction_confidence: number;
  raw_extracted_text: string;
  field_confidences: Record<string, number>;
  source_document: string | null;
}

export interface NormalisedRecord {
  payment: PaymentRecord;
  amount_myr_at_invoice_rate: MoneyStr;
  amount_myr_at_settlement_rate: MoneyStr;
  fx_rate_invoice: MoneyStr;
  fx_rate_settlement: MoneyStr;
  tolerance_low: MoneyStr;
  tolerance_high: MoneyStr;
  estimated_charges_myr: MoneyStr;
  base_currency: string;
}

export interface BankEntry {
  id: UUID;
  value_date: ISODate;
  amount: MoneyStr;
  currency: string;
  description: string;
  reference: string | null;
  counterparty: string | null;
}

export interface CandidateScore {
  bank_entry_id: UUID;
  amount_match_score: number;
  date_proximity_score: number;
  reference_similarity_score: number;
  payer_name_score: number;
  composite: number;
}

export interface MatchResult {
  id: UUID;
  normalised_record: NormalisedRecord;
  bank_entry: BankEntry | null;
  candidate_scores: CandidateScore[];
  confidence: number;
  status: MatchStatus;
  amount_variance_myr: MoneyStr;
  variance_explanation: string;
  reasoning_chain: string;
  human_reviewed: boolean;
  review_notes: string | null;
}

export interface ReconciliationSummary {
  total_records: number;
  matched_count: number;
  uncertain_count: number;
  unmatched_count: number;
  total_value_myr: MoneyStr;
  matched_value_myr: MoneyStr;
  total_variance_myr: MoneyStr;
  processing_seconds: number;
}

export interface ReconciliationReport {
  job_id: UUID;
  summary: ReconciliationSummary;
  matches: MatchResult[];
  generated_at: ISODateTime;
  base_currency: string;
  narrative: string;
}

export interface JobCreateResponse {
  job_id: UUID;
  status: JobStatus;
  created_at: ISODateTime;
}

export interface JobStatusResponse {
  job_id: UUID;
  status: JobStatus;
  progress_pct: number;
  agents_completed: string[];
  error: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface ReviewActionRequest {
  action: ReviewAction;
  bank_entry_id?: UUID;
  note?: string;
}

export interface ReviewActionResponse {
  match_id: UUID;
  status: MatchStatus;
  human_reviewed: boolean;
  note: string | null;
}

// ─── Job list ────────────────────────────────────────────────────────────────

export interface JobListItem {
  job_id: UUID;
  status: JobStatus;
  progress_pct: number;
  base_currency: string;
  record_count: number;
  matched_count: number;
  uncertain_count: number;
  unmatched_count: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface JobListResponse {
  items: JobListItem[];
  total: number;
  page: number;
  page_size: number;
}

// ─── Tenant / API key ────────────────────────────────────────────────────────

export interface TenantResponse {
  id: UUID;
  name: string;
  created_at: ISODateTime;
}

export interface ApiKeyResponse {
  id: UUID;
  tenant_id: UUID;
  label: string;
  last_used_at: ISODateTime | null;
  expires_at: ISODateTime | null;
  enabled: boolean;
  created_at: ISODateTime;
  key?: string; // only returned on creation
}

// ─── Transaction ingestion ────────────────────────────────────────────────────

export interface TransactionIngestResponse {
  buffered: number;
  tenant_id: UUID;
}

export interface QueueCorridorStatus {
  corridor: string;
  buffered_count: number;
  oldest_received_at: ISODateTime | null;
}

export interface QueueStatusResponse {
  tenant_id: UUID;
  total_buffered: number;
  by_corridor: QueueCorridorStatus[];
  next_batch_trigger: 'count' | 'time' | 'both' | 'none';
}

// ─── Webhooks ────────────────────────────────────────────────────────────────

export const WebhookEvent = {
  JOB_COMPLETED: 'job.completed',
  JOB_FAILED: 'job.failed',
  JOB_REVIEW_REQUIRED: 'job.review_required',
} as const;
export type WebhookEvent = (typeof WebhookEvent)[keyof typeof WebhookEvent];

export interface WebhookResponse {
  id: UUID;
  tenant_id: UUID;
  url: string;
  events: string[];
  label: string;
  enabled: boolean;
  created_at: ISODateTime;
  secret?: string; // only on creation
}

export interface WebhookDeliveryResponse {
  id: UUID;
  webhook_id: UUID;
  job_id: UUID | null;
  event: string;
  status: string;
  attempt_count: number;
  last_attempt_at: ISODateTime | null;
  response_code: number | null;
  created_at: ISODateTime;
}

// ─── SSE events ──────────────────────────────────────────────────────────────

export interface SSEEventData {
  status?: string;
  progress_pct?: number;
  agents_completed?: string[];
  error?: string;
  summary?: {
    matched: number;
    uncertain: number;
    unmatched: number;
    total: number;
  };
}

export interface StreamEvent {
  event: string;
  data: SSEEventData;
}

// ─── Bank accounts ───────────────────────────────────────────────────────────

export interface BankAccountCreate {
  name: string;
  bank_name: string;
  account_number_masked: string;
  currency: string;
}

export interface BankAccountUpdate {
  name?: string;
  bank_name?: string;
  account_number_masked?: string;
  currency?: string;
}

export interface LedgerEntryCreate {
  value_date: ISODate;
  amount: MoneyStr;
  currency: string;
  description?: string;
  reference?: string | null;
  counterparty?: string | null;
}

export interface LedgerBulkCreateResponse {
  created_count: number;
  items: LedgerEntryItem[];
}

export interface BankAccountResponse {
  id: UUID;
  tenant_id: UUID | null;
  name: string;
  bank_name: string;
  account_number_masked: string;
  currency: string;
  created_at: ISODateTime;
  statement_count: number;
  entry_count: number;
  uncleared_count: number;
}

export interface BankStatementSummary {
  id: UUID;
  tenant_id: UUID | null;
  filename: string;
  base_currency: string;
  statement_period_start: ISODate | null;
  statement_period_end: ISODate | null;
  entry_count: number;
  uncleared_count: number;
  created_at: ISODateTime;
}

export interface BankStatementUploadResponse {
  id: UUID;
  filename: string;
  entry_count: number;
  account_id: UUID | null;
  statement_period_start: ISODate | null;
  statement_period_end: ISODate | null;
}

export interface LedgerEntryItem {
  id: UUID;
  statement_id: UUID;
  statement_filename: string;
  value_date: ISODate;
  amount: MoneyStr;
  currency: string;
  description: string;
  reference: string | null;
  counterparty: string | null;
  cleared: boolean;
  cleared_by_job_id: UUID | null;
}

export interface LedgerEntryUpdate {
  value_date?: ISODate;
  amount?: MoneyStr;
  currency?: string;
  description?: string;
  reference?: string | null;
  counterparty?: string | null;
}

export interface LedgerPageResponse {
  items: LedgerEntryItem[];
  total: number;
  page: number;
  page_size: number;
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface AnalyticsCorridorBreakdown {
  corridor: string;
  job_count: number;
  record_count: number;
  avg_match_rate: number;
}

export interface AnalyticsSummary {
  tenant_id: UUID;
  period_start: ISODate;
  period_end: ISODate;
  total_jobs: number;
  total_records: number;
  matched_records: number;
  uncertain_records: number;
  unmatched_records: number;
  avg_match_rate: number;
  avg_processing_seconds: number;
  escalation_rate: number;
  by_corridor: AnalyticsCorridorBreakdown[];
}

export interface ConfidenceBucket {
  label: string;
  min_val: number;
  max_val: number;
  count: number;
  pct: number;
}

export interface JobProcessingPoint {
  job_id: UUID;
  created_at: ISODateTime;
  processing_seconds: number;
  record_count: number;
}

export interface AIPerformanceSummary {
  period_start: ISODate;
  period_end: ISODate;
  total_records: number;
  avg_confidence: number;
  confidence_buckets: ConfidenceBucket[];
  auto_matched_count: number;
  human_confirmed_count: number;
  human_rejected_count: number;
  human_review_confirmation_rate: number;
  match_rate_target_met: boolean;
  escalation_in_target_range: boolean;
  processing_target_met: boolean;
  avg_processing_seconds: number;
  recent_jobs: JobProcessingPoint[];
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'tenant_user';

export interface UserResponse {
  id: UUID;
  email: string;
  role: UserRole;
  tenant_id: UUID | null;
  is_active: boolean;
  created_at: ISODateTime;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: UserResponse;
}
