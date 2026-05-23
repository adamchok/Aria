import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { ReconciliationReport, UUID } from '@/types/api';

export function useResults(jobId: UUID | null) {
  return useQuery<ReconciliationReport, Error>({
    queryKey: ['job', jobId, 'results'],
    enabled: !!jobId,
    queryFn: () => api.getJobResults(jobId as UUID),
    staleTime: 30_000,
  });
}
