import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { MatchResult, UUID } from '@/types/api';

export function useReviewQueue(jobId: UUID | null) {
  return useQuery<MatchResult[], Error>({
    queryKey: ['job', jobId, 'review'],
    enabled: !!jobId,
    queryFn: () => api.getReviewQueue(jobId as UUID),
    staleTime: 5_000,
  });
}
