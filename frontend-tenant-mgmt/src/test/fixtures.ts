import type {
  AIPerformanceSummary,
  AnalyticsSummary,
  ApiKeyResponse,
  BankAccountResponse,
  BankStatementSummary,
  LedgerEntryItem,
  LedgerPageResponse,
  LoginResponse,
  QueueStatusResponse,
  UserResponse,
  WebhookDeliveryResponse,
  WebhookResponse,
} from '@/types/api';
import { WebhookEvent } from '@/types/api';

export const TENANT_ID = '00000000-0000-0000-0001-000000000001';
export const ACCOUNT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
export const STMT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
export const KEY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
export const WEBHOOK_ID = 'wwwwwwww-wwww-wwww-wwww-wwwwwwwwwwww';
export const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

export const tenantUserFixture: UserResponse = {
  id: USER_ID,
  email: 'finance@acme.test',
  role: 'tenant_user',
  tenant_id: TENANT_ID,
  is_active: true,
  created_at: '2026-05-01T08:00:00Z',
};

export const adminUserFixture: UserResponse = {
  id: 'admin-admin-admin-admin-adminadmin',
  email: 'admin@aria.local',
  role: 'admin',
  tenant_id: null,
  is_active: true,
  created_at: '2026-05-01T08:00:00Z',
};

export const loginResponseFixture: LoginResponse = {
  access_token: 'test-jwt-token',
  token_type: 'bearer',
  user: tenantUserFixture,
};

export const apiKeyFixture: ApiKeyResponse = {
  id: KEY_ID,
  tenant_id: TENANT_ID,
  label: 'Production',
  last_used_at: null,
  expires_at: null,
  enabled: true,
  created_at: '2026-05-03T08:00:00Z',
};

export const analyticsFixture: AnalyticsSummary = {
  tenant_id: TENANT_ID,
  period_start: '2026-04-01',
  period_end: '2026-05-01',
  total_jobs: 12,
  total_records: 240,
  matched_records: 220,
  uncertain_records: 15,
  unmatched_records: 5,
  avg_match_rate: 0.917,
  avg_processing_seconds: 38.5,
  escalation_rate: 0.062,
  by_corridor: [
    { corridor: 'USD/MYR', job_count: 8, record_count: 160, avg_match_rate: 0.925 },
    { corridor: 'EUR/MYR', job_count: 4, record_count: 80, avg_match_rate: 0.9 },
  ],
};

export const aiPerformanceFixture: AIPerformanceSummary = {
  period_start: '2026-04-01',
  period_end: '2026-05-01',
  total_records: 240,
  avg_confidence: 0.83,
  confidence_buckets: [
    { label: '< 50%', min_val: 0.0, max_val: 0.5, count: 5, pct: 0.021 },
    { label: '50–75%', min_val: 0.5, max_val: 0.75, count: 15, pct: 0.063 },
    { label: '75–90%', min_val: 0.75, max_val: 0.9, count: 80, pct: 0.333 },
    { label: '≥ 90%', min_val: 0.9, max_val: 1.0, count: 140, pct: 0.583 },
  ],
  auto_matched_count: 210,
  human_confirmed_count: 12,
  human_rejected_count: 3,
  human_review_confirmation_rate: 0.8,
  match_rate_target_met: true,
  escalation_in_target_range: true,
  processing_target_met: true,
  avg_processing_seconds: 38.5,
  recent_jobs: [
    {
      job_id: '11111111-1111-1111-1111-111111111111',
      created_at: '2026-04-15T10:00:00Z',
      processing_seconds: 32.1,
      record_count: 20,
    },
    {
      job_id: '22222222-2222-2222-2222-222222222222',
      created_at: '2026-04-22T10:00:00Z',
      processing_seconds: 45.7,
      record_count: 30,
    },
  ],
};

export const queueFixture: QueueStatusResponse = {
  tenant_id: TENANT_ID,
  total_buffered: 6,
  next_batch_trigger: 'count',
  by_corridor: [
    { corridor: 'USD/MYR', buffered_count: 4, oldest_received_at: '2026-05-23T08:00:00Z' },
    { corridor: 'EUR/MYR', buffered_count: 2, oldest_received_at: '2026-05-23T09:00:00Z' },
  ],
};

export const webhookFixture: WebhookResponse = {
  id: WEBHOOK_ID,
  tenant_id: TENANT_ID,
  url: 'https://erp.example.com/webhooks/aria',
  events: [WebhookEvent.JOB_COMPLETED],
  label: 'ERP',
  enabled: true,
  created_at: '2026-05-04T08:00:00Z',
};

export const webhookDeliveryFixture: WebhookDeliveryResponse = {
  id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  webhook_id: WEBHOOK_ID,
  job_id: '11111111-1111-1111-1111-111111111111',
  event: WebhookEvent.JOB_COMPLETED,
  status: 'SUCCESS',
  attempt_count: 1,
  last_attempt_at: '2026-05-23T10:00:00Z',
  response_code: 200,
  created_at: '2026-05-23T10:00:00Z',
};

export const bankAccountFixture: BankAccountResponse = {
  id: ACCOUNT_ID,
  tenant_id: TENANT_ID,
  name: 'Main Operating Account',
  bank_name: 'Maybank',
  account_number_masked: '****1234',
  currency: 'MYR',
  created_at: '2026-05-01T08:00:00Z',
  statement_count: 1,
  entry_count: 2,
  uncleared_count: 2,
};

export const statementFixture: BankStatementSummary = {
  id: STMT_ID,
  tenant_id: TENANT_ID,
  filename: 'may_2026.csv',
  base_currency: 'MYR',
  statement_period_start: '2026-05-01',
  statement_period_end: '2026-05-31',
  entry_count: 2,
  uncleared_count: 2,
  created_at: '2026-05-02T08:00:00Z',
};

export const ledgerEntryFixture: LedgerEntryItem = {
  id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  statement_id: STMT_ID,
  statement_filename: 'may_2026.csv',
  value_date: '2026-05-01',
  amount: '1000.00',
  currency: 'MYR',
  description: 'Payment from Acme',
  reference: 'INV-001',
  counterparty: null,
  cleared: false,
  cleared_by_job_id: null,
};

export const ledgerPageFixture: LedgerPageResponse = {
  items: [ledgerEntryFixture],
  total: 1,
  page: 1,
  page_size: 50,
};
