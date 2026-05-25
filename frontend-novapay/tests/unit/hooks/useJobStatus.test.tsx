import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useJobStatus, isTerminalStatus } from '@/hooks/useJobStatus';
import { JOB_ID } from '@/test/fixtures';

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useJobStatus', () => {
  it('returns the job status from the API', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useJobStatus(JOB_ID), { wrapper: wrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe('COMPLETED');
    expect(result.current.data?.progress_pct).toBe(100);
  });

  it('is disabled when jobId is null', () => {
    const client = new QueryClient();
    const { result } = renderHook(() => useJobStatus(null), { wrapper: wrapper(client) });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('isTerminalStatus', () => {
  it.each(['COMPLETED', 'AWAITING_REVIEW', 'FAILED'] as const)('treats %s as terminal', (s) => {
    expect(isTerminalStatus(s)).toBe(true);
  });

  it.each(['PENDING', 'INGESTING', 'MATCHING'] as const)('treats %s as non-terminal', (s) => {
    expect(isTerminalStatus(s)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isTerminalStatus(undefined)).toBe(false);
  });
});
