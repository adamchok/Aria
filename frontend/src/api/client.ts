import type {
  AnalyticsSummary,
  ApiKeyResponse,
  BankAccountCreate,
  BankAccountResponse,
  BankStatementSummary,
  BankStatementUploadResponse,
  JobCreateResponse,
  JobListResponse,
  JobStatusResponse,
  LedgerPageResponse,
  MatchResult,
  QueueStatusResponse,
  ReconciliationReport,
  ReviewActionRequest,
  ReviewActionResponse,
  TenantResponse,
  TransactionIngestResponse,
  UUID,
  WebhookDeliveryResponse,
  WebhookResponse,
} from '@/types/api';
import { getApiKey } from '@/stores/tenant-store';

const API_BASE = (import.meta.env?.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown, message?: string) {
    super(message ?? `Request failed with status ${status}`);
    this.status = status;
    this.detail = detail;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const apiKey = getApiKey();
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let detail: unknown = null;
    try {
      detail = await response.json();
    } catch {
      detail = await response.text();
    }
    const message =
      (typeof detail === 'object' && detail && 'detail' in detail
        ? String((detail as { detail: unknown }).detail)
        : undefined) ?? `HTTP ${response.status}`;
    throw new ApiError(response.status, detail, message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface CreateJobInput {
  paymentProofs: File[];
  bankStatement: File;
  baseCurrency: string;
}

export const api = {
  // ─── Jobs ──────────────────────────────────────────────────────────────────

  createJob: async (input: CreateJobInput): Promise<JobCreateResponse> => {
    const form = new FormData();
    for (const file of input.paymentProofs) form.append('payment_proofs', file, file.name);
    form.append('bank_statement', input.bankStatement, input.bankStatement.name);
    form.append('base_currency', input.baseCurrency);
    return request<JobCreateResponse>('/api/v1/jobs', { method: 'POST', body: form });
  },

  listJobs: (params?: { status?: string; page?: number; page_size?: number }): Promise<JobListResponse> => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.page !== undefined) qs.set('page', String(params.page));
    if (params?.page_size !== undefined) qs.set('page_size', String(params.page_size));
    const query = qs.toString();
    return request<JobListResponse>(`/api/v1/jobs${query ? `?${query}` : ''}`);
  },

  getJobStatus: (jobId: UUID): Promise<JobStatusResponse> =>
    request<JobStatusResponse>(`/api/v1/jobs/${jobId}`),

  getJobResults: (jobId: UUID): Promise<ReconciliationReport> =>
    request<ReconciliationReport>(`/api/v1/jobs/${jobId}/results`),

  getReviewQueue: (jobId: UUID): Promise<MatchResult[]> =>
    request<MatchResult[]>(`/api/v1/jobs/${jobId}/review`),

  submitReviewAction: (
    jobId: UUID,
    matchId: UUID,
    payload: ReviewActionRequest,
  ): Promise<ReviewActionResponse> =>
    request<ReviewActionResponse>(`/api/v1/jobs/${jobId}/review/${matchId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  exportUrl: (jobId: UUID): string => {
    const apiKey = getApiKey();
    const qs = apiKey ? `?api_key=${encodeURIComponent(apiKey)}` : '';
    return `${API_BASE}/api/v1/jobs/${jobId}/export${qs}`;
  },

  // ─── Tenants / API keys ────────────────────────────────────────────────────

  listTenants: (): Promise<TenantResponse[]> =>
    request<TenantResponse[]>('/api/v1/tenants'),

  createTenant: (name: string): Promise<TenantResponse> =>
    request<TenantResponse>('/api/v1/tenants', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  listApiKeys: (tenantId: UUID): Promise<ApiKeyResponse[]> =>
    request<ApiKeyResponse[]>(`/api/v1/tenants/${tenantId}/keys`),

  createApiKey: (tenantId: UUID, label?: string): Promise<ApiKeyResponse> =>
    request<ApiKeyResponse>(`/api/v1/tenants/${tenantId}/keys`, {
      method: 'POST',
      body: JSON.stringify({ label: label ?? '' }),
    }),

  revokeApiKey: (tenantId: UUID, keyId: UUID): Promise<void> =>
    request<void>(`/api/v1/tenants/${tenantId}/keys/${keyId}`, { method: 'DELETE' }),

  // ─── Transaction ingestion ─────────────────────────────────────────────────

  getQueueStatus: (): Promise<QueueStatusResponse> =>
    request<QueueStatusResponse>('/api/v1/ingest/queue'),

  flushQueue: (): Promise<TransactionIngestResponse> =>
    request<TransactionIngestResponse>('/api/v1/ingest/queue/flush', { method: 'POST' }),

  // ─── Webhooks ──────────────────────────────────────────────────────────────

  listWebhooks: (): Promise<WebhookResponse[]> =>
    request<WebhookResponse[]>('/api/v1/webhooks'),

  createWebhook: (payload: { url: string; events: string[]; label?: string }): Promise<WebhookResponse> =>
    request<WebhookResponse>('/api/v1/webhooks', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteWebhook: (webhookId: UUID): Promise<void> =>
    request<void>(`/api/v1/webhooks/${webhookId}`, { method: 'DELETE' }),

  testWebhook: (webhookId: UUID): Promise<{ queued: boolean }> =>
    request<{ queued: boolean }>(`/api/v1/webhooks/${webhookId}/test`, { method: 'POST' }),

  listWebhookDeliveries: (webhookId: UUID): Promise<WebhookDeliveryResponse[]> =>
    request<WebhookDeliveryResponse[]>(`/api/v1/webhooks/${webhookId}/deliveries`),

  // ─── Bank accounts ─────────────────────────────────────────────────────────

  listBankAccounts: (): Promise<BankAccountResponse[]> =>
    request<BankAccountResponse[]>('/api/v1/bank-accounts'),

  getBankAccount: (accountId: UUID): Promise<BankAccountResponse> =>
    request<BankAccountResponse>(`/api/v1/bank-accounts/${accountId}`),

  createBankAccount: (payload: BankAccountCreate): Promise<BankAccountResponse> =>
    request<BankAccountResponse>('/api/v1/bank-accounts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteBankAccount: (accountId: UUID): Promise<void> =>
    request<void>(`/api/v1/bank-accounts/${accountId}`, { method: 'DELETE' }),

  listAccountStatements: (accountId: UUID): Promise<BankStatementSummary[]> =>
    request<BankStatementSummary[]>(`/api/v1/bank-accounts/${accountId}/statements`),

  uploadAccountStatement: (accountId: UUID, file: File): Promise<BankStatementUploadResponse> => {
    const form = new FormData();
    form.append('bank_statement', file, file.name);
    return request<BankStatementUploadResponse>(`/api/v1/bank-accounts/${accountId}/statements`, {
      method: 'POST',
      body: form,
    });
  },

  getAccountLedger: (
    accountId: UUID,
    params?: { cleared?: boolean; page?: number; page_size?: number },
  ): Promise<LedgerPageResponse> => {
    const qs = new URLSearchParams();
    if (params?.cleared !== undefined) qs.set('cleared', String(params.cleared));
    if (params?.page !== undefined) qs.set('page', String(params.page));
    if (params?.page_size !== undefined) qs.set('page_size', String(params.page_size));
    const query = qs.toString();
    return request<LedgerPageResponse>(`/api/v1/bank-accounts/${accountId}/ledger${query ? `?${query}` : ''}`);
  },

  // ─── Analytics ─────────────────────────────────────────────────────────────

  getAnalytics: (params?: { period_start?: string; period_end?: string }): Promise<AnalyticsSummary> => {
    const qs = new URLSearchParams();
    if (params?.period_start) qs.set('period_start', params.period_start);
    if (params?.period_end) qs.set('period_end', params.period_end);
    const query = qs.toString();
    return request<AnalyticsSummary>(`/api/v1/analytics/summary${query ? `?${query}` : ''}`);
  },
};

export type Api = typeof api;
