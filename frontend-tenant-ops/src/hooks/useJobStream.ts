import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { JobStatusResponse, SSEEventData, StreamEvent, UUID } from '@/types/api';
import { getAccessToken } from '@/stores/auth-store';

const SSE_EVENTS = [
  'status_change',
  'agent_complete',
  'progress_update',
  'match_found',
  'completed',
  'review_required',
  'error',
] as const;

const TERMINAL_EVENTS = new Set(['completed', 'review_required', 'error']);

export interface UseJobStreamOptions {
  onEvent?: (e: StreamEvent) => void;
  onComplete?: (data: SSEEventData) => void;
  onReviewRequired?: (data: SSEEventData) => void;
  onError?: (error: string) => void;
  enabled?: boolean;
}

function patchJobStatus(
  old: JobStatusResponse | undefined,
  data: SSEEventData,
): JobStatusResponse | undefined {
  if (!old) return old;
  return {
    ...old,
    status: (data.status as JobStatusResponse['status']) ?? old.status,
    progress_pct: data.progress_pct ?? old.progress_pct,
    agents_completed: data.agents_completed ?? old.agents_completed,
    error: data.error ?? old.error,
  };
}

/**
 * Opens an SSE connection to /api/v1/jobs/{jobId}/stream.
 * Reconnects automatically on transient errors; closes on terminal events.
 * Hydrates the TanStack Query cache for ['job', jobId, 'status'] on each event.
 */
export function useJobStream(jobId: UUID | null, options: UseJobStreamOptions = {}) {
  const qc = useQueryClient();
  const callbacksRef = useRef(options);
  callbacksRef.current = options;
  const mountedRef = useRef(true);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    if (!jobId || options.enabled === false) return;

    let es: EventSource | null = null;

    function applyPatch(data: SSEEventData) {
      qc.setQueryData<JobStatusResponse>(['job', jobId, 'status'], (old) => {
        if (!old) {
          void qc.invalidateQueries({ queryKey: ['job', jobId, 'status'] });
          return old;
        }
        return patchJobStatus(old, data);
      });
    }

    function open() {
      if (!mountedRef.current) return;

      const token = getAccessToken();
      const qs = token ? `?access_token=${encodeURIComponent(token)}` : '';
      es = new EventSource(`/api/v1/jobs/${jobId}/stream${qs}`);

      SSE_EVENTS.forEach((event) => {
        es!.addEventListener(event, (raw) => {
          if (!mountedRef.current) return;
          try {
            const data = JSON.parse((raw as MessageEvent).data) as SSEEventData;
            const cbs = callbacksRef.current;

            cbs.onEvent?.({ event, data });

            if (
              data.status !== undefined ||
              data.progress_pct !== undefined ||
              data.agents_completed !== undefined ||
              data.error !== undefined
            ) {
              applyPatch(data);
            }

            if (event === 'completed') cbs.onComplete?.(data);
            if (event === 'review_required') cbs.onReviewRequired?.(data);
            if (event === 'error') cbs.onError?.(data.error ?? 'Pipeline failed');

            if (TERMINAL_EVENTS.has(event)) {
              es?.close();
            }
          } catch {
            // Ignore malformed SSE payload
          }
        });
      });

      es.onerror = () => {
        es?.close();
        if (mountedRef.current) {
          reconnectTimerRef.current = setTimeout(open, 3_000);
        }
      };
    }

    open();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      es?.close();
    };
  }, [jobId, options.enabled, qc]); // eslint-disable-line react-hooks/exhaustive-deps
}
