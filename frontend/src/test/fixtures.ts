import type {
  JobCreateResponse,
  JobStatusResponse,
  MatchResult,
  ReconciliationReport,
} from '@/types/api';

export const JOB_ID = '11111111-1111-1111-1111-111111111111';

export const jobCreateResponse: JobCreateResponse = {
  job_id: JOB_ID,
  status: 'PENDING',
  created_at: '2026-05-23T08:00:00Z',
};

export const jobStatusCompleted: JobStatusResponse = {
  job_id: JOB_ID,
  status: 'COMPLETED',
  progress_pct: 100,
  agents_completed: ['ingestion', 'normalisation', 'matching', 'report'],
  error: null,
  created_at: '2026-05-23T08:00:00Z',
  updated_at: '2026-05-23T08:00:30Z',
};

export const jobStatusAwaitingReview: JobStatusResponse = {
  ...jobStatusCompleted,
  status: 'AWAITING_REVIEW',
};

export const matchedItem: MatchResult = {
  id: 'aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  normalised_record: {
    payment: {
      id: 'pay-1',
      payer: 'Acme US Inc',
      payee: 'ARIA Demo SDN BHD',
      amount_original: '1000.00',
      currency: 'USD',
      value_date: '2026-05-18',
      reference: 'INV-001',
      bank_charges: null,
      source_format: 'IMAGE',
      extraction_confidence: 0.95,
      raw_extracted_text: '',
      field_confidences: {},
      source_document: null,
    },
    amount_myr_at_invoice_rate: '4230.00',
    amount_myr_at_settlement_rate: '4230.00',
    fx_rate_invoice: '4.230',
    fx_rate_settlement: '4.230',
    tolerance_low: '4115.79',
    tolerance_high: '4293.45',
    estimated_charges_myr: '50.76',
    base_currency: 'MYR',
  },
  bank_entry: {
    id: 'bank-1',
    value_date: '2026-05-20',
    amount: '4179.24',
    currency: 'MYR',
    description: 'Inward TT Acme US Inc',
    reference: 'INV-001',
    counterparty: 'ACME US INC',
  },
  candidate_scores: [],
  confidence: 0.88,
  status: 'MATCHED',
  amount_variance_myr: '-50.76',
  variance_explanation: 'Bank entry within tolerance after SWIFT charge of MYR 50.76.',
  reasoning_chain: '...',
  human_reviewed: false,
  review_notes: null,
};

export const uncertainItem: MatchResult = {
  ...matchedItem,
  id: 'bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  confidence: 0.62,
  status: 'UNCERTAIN',
  variance_explanation: 'Amount inside tolerance but payer name match is weak.',
};

export const reportFixture: ReconciliationReport = {
  job_id: JOB_ID,
  base_currency: 'MYR',
  generated_at: '2026-05-23T08:00:30Z',
  narrative:
    'ARIA reconciled 1 of 2 records with high confidence. 1 item routed to human review.',
  summary: {
    total_records: 2,
    matched_count: 1,
    uncertain_count: 1,
    unmatched_count: 0,
    total_value_myr: '8460.00',
    matched_value_myr: '4230.00',
    total_variance_myr: '-50.76',
    processing_seconds: 28.4,
  },
  matches: [matchedItem, uncertainItem],
};
