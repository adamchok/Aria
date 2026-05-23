import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { JobStatusResponse, UUID } from '@/types/api';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'AWAITING_REVIEW', 'FAILED']);

export function useJobStatus(
  jobId: UUID | null,
  options: { pollMs?: number } = {},
): UseQueryResult<JobStatusResponse, Error> {
  return useQuery({
    queryKey: ['job', jobId, 'status'],
    enabled: !!jobId,
    queryFn: () => api.getJobStatus(jobId as UUID),
    refetchInterval: (query) => {
      const data = query.state.data as JobStatusResponse | undefined;
      if (data && TERMINAL_STATUSES.has(data.status)) return false;
      return options.pollMs ?? 2_000;
    },
  });
}

export function isTerminalStatus(status: string | undefined): boolean {
  return !!status && TERMINAL_STATUSES.has(status);
}
