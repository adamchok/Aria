import type {
  AdminAnalyticsSummary,
  AdminQueueStatusResponse,
  ApiKeyResponse,
  LoginResponse,
  TenantResponse,
  UserResponse,
  UUID,
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
  const token = getAccessToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let detail: unknown = null;
    const bodyText = await response.text();
    try {
      detail = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      detail = bodyText;
    }
    if (response.status === 401) useAuthStore.getState().clear();
    throw new ApiError(response.status, detail);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  login: (email: string, password: string): Promise<LoginResponse> =>
    request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  me: (): Promise<UserResponse> => request('/api/v1/auth/me'),

  listTenants: (): Promise<TenantResponse[]> => request('/api/v1/tenants'),
  createTenant: (name: string): Promise<TenantResponse> =>
    request('/api/v1/tenants', { method: 'POST', body: JSON.stringify({ name }) }),

  listTenantKeys: (tenantId: UUID): Promise<ApiKeyResponse[]> =>
    request(`/api/v1/tenants/${tenantId}/keys`),

  listUsers: (tenantId?: string): Promise<UserResponse[]> => {
    const qs = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : '';
    return request(`/api/v1/users${qs}`);
  },

  createUser: (payload: {
    email: string;
    password: string;
    role: 'admin' | 'tenant_user';
    tenant_id?: string;
  }): Promise<UserResponse> =>
    request('/api/v1/users', { method: 'POST', body: JSON.stringify(payload) }),

  getAdminAnalytics: (): Promise<AdminAnalyticsSummary> =>
    request('/api/v1/analytics/admin/summary'),

  getAdminQueue: (): Promise<AdminQueueStatusResponse> =>
    request('/api/v1/ingest/admin/queue'),

  flushAdminQueue: (tenantId: string): Promise<{ status: string }> =>
    request(`/api/v1/ingest/admin/queue/flush/${tenantId}`, { method: 'POST' }),
};
