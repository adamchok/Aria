import type {
  AdminAnalyticsSummary,
  AdminQueueStatusResponse,
  ApiKeyResponse,
  LoginResponse,
  TenantResponse,
  UserResponse,
} from '@/types/api';

export const TENANT_ID = '00000000-0000-0000-0001-000000000001';
export const TENANT_ID_2 = '00000000-0000-0000-0001-000000000002';
export const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const KEY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

export const adminUserFixture: UserResponse = {
  id: 'admin-0000-0000-0000-000000000001',
  email: 'admin@aria.local',
  role: 'admin',
  tenant_id: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
};

export const tenantUserFixture: UserResponse = {
  id: USER_ID,
  email: 'finance@acme.test',
  role: 'tenant_user',
  tenant_id: TENANT_ID,
  is_active: true,
  created_at: '2026-05-01T08:00:00Z',
};

export const loginResponseFixture: LoginResponse = {
  access_token: 'test-jwt-token',
  token_type: 'bearer',
  user: adminUserFixture,
};

export const tenantFixture: TenantResponse = {
  id: TENANT_ID,
  name: 'Acme Corp',
  created_at: '2026-05-01T08:00:00Z',
};

export const tenantFixture2: TenantResponse = {
  id: TENANT_ID_2,
  name: 'Beta Ltd',
  created_at: '2026-05-02T08:00:00Z',
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

export const adminAnalyticsFixture: AdminAnalyticsSummary = {
  period_start: '2026-04-01',
  period_end: '2026-05-01',
  total_tenants: 2,
  total_jobs: 15,
  total_records: 312,
  matched_records: 289,
  uncertain_records: 18,
  unmatched_records: 5,
  avg_match_rate: 0.926,
  escalation_rate: 0.058,
  by_tenant: [
    {
      tenant_id: TENANT_ID,
      tenant_name: 'Acme Corp',
      total_jobs: 10,
      total_records: 200,
      matched_records: 185,
      uncertain_records: 10,
      unmatched_records: 5,
      avg_match_rate: 0.925,
      escalation_rate: 0.06,
    },
    {
      tenant_id: TENANT_ID_2,
      tenant_name: 'Beta Ltd',
      total_jobs: 5,
      total_records: 112,
      matched_records: 104,
      uncertain_records: 5,
      unmatched_records: 3,
      avg_match_rate: 0.929,
      escalation_rate: 0.05,
    },
  ],
};

export const adminQueueFixture: AdminQueueStatusResponse = {
  total_buffered_system: 12,
  tenants: [
    {
      tenant_id: TENANT_ID,
      tenant_name: 'Acme Corp',
      total_buffered: 8,
      next_batch_trigger: 'count',
    },
    {
      tenant_id: TENANT_ID_2,
      tenant_name: 'Beta Ltd',
      total_buffered: 4,
      next_batch_trigger: 'time',
    },
  ],
};
