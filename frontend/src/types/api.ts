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
