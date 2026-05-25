import type {
  BankAccountCreate,
  BankAccountResponse,
  BankAccountUpdate,
  BankEntry,
  BankStatementSummary,
  BankStatementUploadResponse,
  JobCreateResponse,
  JobListResponse,
  JobStatusResponse,
  LedgerBulkCreateResponse,
  LedgerEntryCreate,
  LedgerEntryItem,
  LedgerEntryUpdate,
  LedgerPageResponse,
  LoginResponse,
  MatchResult,
  ReconciliationReport,
  ReviewActionRequest,
  ReviewActionResponse,
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
    const bodyText = await response.text();
    try {
      detail = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      detail = bodyText;
    }
    if (response.status === 401) {
      useAuthStore.getState().clear();
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
  bankStatement?: File;
  bankStatementId?: UUID;
  bankAccountId?: UUID;
  baseCurrency: string;
}

export const api = {
  login: (email: string, password: string): Promise<LoginResponse> =>
    request<LoginResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<LoginResponse['user']>('/api/v1/auth/me'),

  createJob: async (input: CreateJobInput): Promise<JobCreateResponse> => {
    const form = new FormData();
    for (const file of input.paymentProofs) form.append('payment_proofs', file, file.name);
    if (input.bankAccountId) {
      form.append('bank_account_id', input.bankAccountId);
    } else if (input.bankStatementId) {
      form.append('bank_statement_id', input.bankStatementId);
    } else if (input.bankStatement) {
      form.append('bank_statement', input.bankStatement, input.bankStatement.name);
    }
    form.append('base_currency', input.baseCurrency);
    return request<JobCreateResponse>('/api/v1/jobs', { method: 'POST', body: form });
  },

  listBankAccounts: (): Promise<BankAccountResponse[]> =>
    request<BankAccountResponse[]>('/api/v1/bank-accounts'),

  getBankAccount: (accountId: UUID): Promise<BankAccountResponse> =>
    request<BankAccountResponse>(`/api/v1/bank-accounts/${accountId}`),

  createBankAccount: (payload: BankAccountCreate): Promise<BankAccountResponse> =>
    request<BankAccountResponse>('/api/v1/bank-accounts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateBankAccount: (accountId: UUID, payload: BankAccountUpdate): Promise<BankAccountResponse> =>
    request<BankAccountResponse>(`/api/v1/bank-accounts/${accountId}`, {
      method: 'PATCH',
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

  deleteAccountStatement: (accountId: UUID, statementId: UUID): Promise<void> =>
    request<void>(`/api/v1/bank-accounts/${accountId}/statements/${statementId}`, { method: 'DELETE' }),

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

  createLedgerEntry: (accountId: UUID, payload: LedgerEntryCreate): Promise<LedgerEntryItem> =>
    request<LedgerEntryItem>(`/api/v1/bank-accounts/${accountId}/ledger`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createLedgerEntries: (accountId: UUID, entries: LedgerEntryCreate[]): Promise<LedgerBulkCreateResponse> =>
    request<LedgerBulkCreateResponse>(`/api/v1/bank-accounts/${accountId}/ledger/bulk`, {
      method: 'POST',
      body: JSON.stringify(entries),
    }),

  updateLedgerEntry: (accountId: UUID, entryId: UUID, payload: LedgerEntryUpdate): Promise<LedgerEntryItem> =>
    request<LedgerEntryItem>(`/api/v1/bank-accounts/${accountId}/ledger/${entryId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteLedgerEntry: (accountId: UUID, entryId: UUID): Promise<void> =>
    request<void>(`/api/v1/bank-accounts/${accountId}/ledger/${entryId}`, { method: 'DELETE' }),

  exportAccountLedger: async (
    accountId: UUID,
    params?: { date_from?: string; date_to?: string; cleared?: boolean },
  ): Promise<Blob> => {
    const qs = new URLSearchParams();
    if (params?.date_from) qs.set('date_from', params.date_from);
    if (params?.date_to) qs.set('date_to', params.date_to);
    if (params?.cleared !== undefined) qs.set('cleared', String(params.cleared));
    const url = `${API_BASE}/api/v1/bank-accounts/${accountId}/ledger/export${qs.toString() ? `?${qs}` : ''}`;
    const token = getAccessToken();
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!response.ok) throw new ApiError(response.status, null, `Export failed: HTTP ${response.status}`);
    return response.blob();
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

  getJobBankEntries: (jobId: UUID): Promise<BankEntry[]> =>
    request<BankEntry[]>(`/api/v1/jobs/${jobId}/bank-entries`),

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
    const token = getAccessToken();
    const qs = token ? `?access_token=${encodeURIComponent(token)}` : '';
    return `${API_BASE}/api/v1/jobs/${jobId}/export${qs}`;
  },
};

export type Api = typeof api;
