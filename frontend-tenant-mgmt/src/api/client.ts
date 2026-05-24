import type {
  AnalyticsSummary,
  ApiKeyResponse,
  BankAccountCreate,
  BankAccountResponse,
  BankStatementSummary,
  BankStatementUploadResponse,
  LedgerPageResponse,
  LoginResponse,
  QueueStatusResponse,
  UserResponse,
  UUID,
  WebhookDeliveryResponse,
  WebhookResponse,
} from '@/types/api';
import { getAccessToken, useAuthStore } from '@/stores/auth-store';

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
  const token = getAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    if (response.status === 401) useAuthStore.getState().clear();
    const message =
      (typeof detail === 'object' && detail && 'detail' in detail
        ? String((detail as { detail: unknown }).detail)
        : undefined) ?? `HTTP ${response.status}`;
    throw new ApiError(response.status, detail, message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  login: (email: string, password: string): Promise<LoginResponse> =>
    request<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getAnalytics: (params?: { period_start?: string; period_end?: string }): Promise<AnalyticsSummary> => {
    const qs = new URLSearchParams();
    if (params?.period_start) qs.set('period_start', params.period_start);
    if (params?.period_end) qs.set('period_end', params.period_end);
    const query = qs.toString();
    return request<AnalyticsSummary>(`/api/v1/analytics/summary${query ? `?${query}` : ''}`);
  },

  getQueueStatus: (): Promise<QueueStatusResponse> =>
    request<QueueStatusResponse>('/api/v1/ingest/queue'),

  flushQueue: (): Promise<{ status: string }> =>
    request<{ status: string }>('/api/v1/ingest/queue/flush', { method: 'POST' }),

  listTenantKeys: (): Promise<ApiKeyResponse[]> =>
    request<ApiKeyResponse[]>('/api/v1/tenant/keys'),

  createTenantKey: (label?: string): Promise<ApiKeyResponse> =>
    request<ApiKeyResponse>('/api/v1/tenant/keys', {
      method: 'POST',
      body: JSON.stringify({ label: label ?? '' }),
    }),

  revokeTenantKey: (keyId: UUID): Promise<void> =>
    request<void>(`/api/v1/tenant/keys/${keyId}`, { method: 'DELETE' }),

  listTenantUsers: (): Promise<UserResponse[]> =>
    request<UserResponse[]>('/api/v1/tenant/users'),

  createTenantUser: (email: string, password: string): Promise<UserResponse> =>
    request<UserResponse>('/api/v1/tenant/users', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

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
};
