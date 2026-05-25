import { useQuery } from '@tanstack/react-query';

import { api } from '@/api/client';
import type { UUID } from '@/types/api';

export function useJobBankEntries(jobId: UUID | null, enabled: boolean) {
  return useQuery({
    queryKey: ['jobBankEntries', jobId],
    queryFn: () => api.getJobBankEntries(jobId!),
    enabled: Boolean(jobId && enabled),
  });
}
