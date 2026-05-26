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
  MatchResult,
  ReconciliationReport,
  ReviewActionRequest,
  ReviewActionResponse,
  TransactionIngestRequest,
  TransactionIngestResponse,
  QueueStatusResponse,
  UUID,
  VendorRule,
  VendorRuleUpdateRequest,
} from '@/types/api';

const API_BASE = (import.meta.env?.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
const API_KEY = (import.meta.env?.VITE_API_KEY ?? '') as string;

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
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
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
  bankStatements?: File[];
  bankStatementId?: UUID;
  bankAccountId?: UUID;
  baseCurrency: string;
}

export const api = {
  createJob: async (input: CreateJobInput): Promise<JobCreateResponse> => {
    const form = new FormData();
    for (const file of input.paymentProofs) form.append('payment_proofs', file, file.name);
    if (input.bankAccountId) {
      form.append('bank_account_id', input.bankAccountId);
    } else if (input.bankStatementId) {
      form.append('bank_statement_id', input.bankStatementId);
    } else if (input.bankStatements?.length) {
      for (const file of input.bankStatements) {
        form.append('bank_statement', file, file.name);
      }
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
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
      },
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

  cancelJob: (jobId: UUID): Promise<JobStatusResponse> =>
    request<JobStatusResponse>(`/api/v1/jobs/${jobId}/cancel`, { method: 'POST' }),

  deleteJob: (jobId: UUID): Promise<void> =>
    request<void>(`/api/v1/jobs/${jobId}`, { method: 'DELETE' }),

  submitReviewAction: (
    jobId: UUID,
    matchId: UUID,
    payload: ReviewActionRequest,
  ): Promise<ReviewActionResponse> =>
    request<ReviewActionResponse>(`/api/v1/jobs/${jobId}/review/${matchId}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  exportJobResults: async (jobId: UUID): Promise<Blob> => {
    const url = `${API_BASE}/api/v1/jobs/${jobId}/export`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
      },
    });
    if (!response.ok) throw new ApiError(response.status, null, `Export failed: HTTP ${response.status}`);
    return response.blob();
  },

  ingestTransactions: (payload: TransactionIngestRequest): Promise<TransactionIngestResponse> =>
    request<TransactionIngestResponse>('/api/v1/ingest/transactions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getQueueStatus: (): Promise<QueueStatusResponse> =>
    request<QueueStatusResponse>('/api/v1/ingest/queue'),

  flushQueue: (): Promise<{ status: string }> =>
    request<{ status: string }>('/api/v1/ingest/queue/flush', { method: 'POST' }),

  listVendorRules: (): Promise<VendorRule[]> =>
    request<VendorRule[]>('/api/v1/vendor-rules'),

  updateVendorRule: (ruleId: UUID, payload: VendorRuleUpdateRequest): Promise<VendorRule> =>
    request<VendorRule>(`/api/v1/vendor-rules/${ruleId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteVendorRule: (ruleId: UUID): Promise<void> =>
    request<void>(`/api/v1/vendor-rules/${ruleId}`, { method: 'DELETE' }),
};

export type Api = typeof api;
