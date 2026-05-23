import type {
  JobCreateResponse,
  JobStatusResponse,
  MatchResult,
  ReconciliationReport,
  ReviewActionRequest,
  ReviewActionResponse,
  UUID,
} from '@/types/api';

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
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
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
  createJob: async (input: CreateJobInput): Promise<JobCreateResponse> => {
    const form = new FormData();
    for (const file of input.paymentProofs) form.append('payment_proofs', file, file.name);
    form.append('bank_statement', input.bankStatement, input.bankStatement.name);
    form.append('base_currency', input.baseCurrency);
    return request<JobCreateResponse>('/api/v1/jobs', { method: 'POST', body: form });
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

  exportUrl: (jobId: UUID): string => `${API_BASE}/api/v1/jobs/${jobId}/export`,
};

export type Api = typeof api;
