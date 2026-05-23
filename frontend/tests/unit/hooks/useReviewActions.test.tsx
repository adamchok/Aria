import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';

import { server } from '@/test/msw-server';
import { JOB_ID, uncertainItem } from '@/test/fixtures';
import { useReviewActions } from '@/hooks/useReviewActions';
import type { MatchResult } from '@/types/api';

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('useReviewActions', () => {
  it('optimistically removes the match from the review queue and confirms it', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData<MatchResult[]>(['job', JOB_ID, 'review'], [uncertainItem]);

    const { result } = renderHook(() => useReviewActions(JOB_ID), { wrapper: wrapper(client) });
    result.current.mutate({
      jobId: JOB_ID,
      matchId: uncertainItem.id,
      payload: { action: 'confirm' },
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe('MATCHED');
  });

  it('rolls the optimistic update back on failure', async () => {
    server.use(
      http.post(`http://localhost/api/v1/jobs/${JOB_ID}/review/:id`, () =>
        HttpResponse.json({ detail: 'boom' }, { status: 500 }),
      ),
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    client.setQueryData<MatchResult[]>(['job', JOB_ID, 'review'], [uncertainItem]);

    const { result } = renderHook(() => useReviewActions(JOB_ID), { wrapper: wrapper(client) });
    result.current.mutate({
      jobId: JOB_ID,
      matchId: uncertainItem.id,
      payload: { action: 'confirm' },
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    const queue = client.getQueryData<MatchResult[]>(['job', JOB_ID, 'review']);
    expect(queue).toHaveLength(1);
    expect(queue?.[0]?.id).toBe(uncertainItem.id);
  });
});
