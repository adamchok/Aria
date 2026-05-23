import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type CreateJobInput } from '@/api/client';
import type { JobCreateResponse } from '@/types/api';

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation<JobCreateResponse, Error, CreateJobInput>({
    mutationFn: (input) => api.createJob(input),
    onSuccess: (data) => {
      qc.setQueryData(['job', data.job_id, 'status'], {
        job_id: data.job_id,
        status: data.status,
        progress_pct: 0,
        agents_completed: [],
        error: null,
        created_at: data.created_at,
        updated_at: data.created_at,
      });
    },
  });
}
