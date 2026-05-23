import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type {
  MatchResult,
  ReviewActionRequest,
  ReviewActionResponse,
  UUID,
} from '@/types/api';

interface SubmitArgs {
  jobId: UUID;
  matchId: UUID;
  payload: ReviewActionRequest;
}

export function useReviewActions(jobId: UUID | null) {
  const qc = useQueryClient();

  return useMutation<ReviewActionResponse, Error, SubmitArgs, { previous: MatchResult[] | undefined }>({
    mutationFn: ({ jobId: j, matchId, payload }) => api.submitReviewAction(j, matchId, payload),

    // Optimistic update — remove the match from the queue immediately.
    onMutate: async ({ matchId }) => {
      if (!jobId) return { previous: undefined };
      await qc.cancelQueries({ queryKey: ['job', jobId, 'review'] });
      const previous = qc.getQueryData<MatchResult[]>(['job', jobId, 'review']);
      if (previous) {
        qc.setQueryData<MatchResult[]>(
          ['job', jobId, 'review'],
          previous.filter((m) => m.id !== matchId),
        );
      }
      return { previous };
    },

    onError: (_err, _args, context) => {
      if (jobId && context?.previous) {
        qc.setQueryData(['job', jobId, 'review'], context.previous);
      }
    },

    onSettled: () => {
      if (jobId) {
        void qc.invalidateQueries({ queryKey: ['job', jobId, 'review'] });
        void qc.invalidateQueries({ queryKey: ['job', jobId, 'results'] });
      }
    },
  });
}
