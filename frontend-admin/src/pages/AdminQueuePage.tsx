import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

const TRIGGER_LABELS: Record<string, { label: string; className: string }> = {
  count: { label: 'Count trigger', className: 'bg-violet-100 text-violet-700' },
  time:  { label: 'Time trigger',  className: 'bg-amber-100 text-amber-700' },
  both:  { label: 'Count + time',  className: 'bg-amber-100 text-amber-700' },
  none:  { label: 'No trigger',    className: 'bg-slate-100 text-slate-500' },
};

export function AdminQueuePage() {
  const qc = useQueryClient();
  const queueQuery = useQuery({
    queryKey: ['admin', 'queue'],
    queryFn: () => api.getAdminQueue(),
  });

  const flushMutation = useMutation({
    mutationFn: (tenantId: string) => api.flushAdminQueue(tenantId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'queue'] }),
  });

  const totalBuffered = queueQuery.data?.total_buffered_system ?? 0;
  const tenantCount = queueQuery.data?.tenants.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Ingestion Queue</h1>
        <p className="mt-1 text-sm text-slate-500">Buffered transactions awaiting auto-batch or manual flush</p>
      </div>

      {queueQuery.isLoading && (
        <p className="text-sm text-slate-500" aria-live="polite">Loading queue status…</p>
      )}
      {queueQuery.isError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-700" role="alert">Failed to load queue status.</p>
          <Button variant="secondary" className="mt-2" onClick={() => void queueQuery.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {queueQuery.data && (
        <Card>
          <CardHeader>
            <CardTitle>
              System total:{' '}
              <span className="tabular-nums">{totalBuffered}</span> buffered
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* System total progress bar */}
            {tenantCount > 0 && (
              <div className="px-4 pt-3 pb-4 border-b border-slate-100">
                <div className="h-2 w-full rounded-full bg-slate-100" aria-hidden="true">
                  {totalBuffered > 0 && (
                    <div
                      className="h-full rounded-full bg-violet-500 transition-all duration-700"
                      style={{ width: '100%' }}
                    />
                  )}
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  <span className="tabular-nums font-medium text-slate-700">{totalBuffered}</span>
                  {' '}buffered across{' '}
                  <span className="tabular-nums font-medium text-slate-700">{tenantCount}</span>
                  {' '}tenant{tenantCount !== 1 ? 's' : ''}
                </p>
              </div>
            )}

            {queueQuery.data.tenants.length === 0 ? (
              <EmptyState
                title="Queue empty"
                description="No tenants have buffered transactions."
                className="m-4 border-0"
              />
            ) : (
              queueQuery.data.tenants.map((t) => {
                const triggerInfo = TRIGGER_LABELS[t.next_batch_trigger] ?? TRIGGER_LABELS['none'];
                const proportion = totalBuffered > 0 ? (t.total_buffered / totalBuffered) * 100 : 0;

                return (
                  <div
                    key={t.tenant_id}
                    className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 first:border-t-0"
                  >
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900">{t.tenant_name}</p>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium ${triggerInfo.className}`}
                          aria-label={`Trigger: ${triggerInfo.label}`}
                        >
                          {triggerInfo.label}
                        </span>
                      </div>
                      {/* Inline proportion bar */}
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold tabular-nums text-slate-900 leading-none">
                          {t.total_buffered}
                        </span>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <p className="text-xs text-slate-500">buffered</p>
                          <div className="h-1 w-24 rounded-full bg-slate-100" aria-hidden="true">
                            <div
                              className="h-full rounded-full bg-violet-400 transition-all duration-700"
                              style={{ width: `${proportion}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      disabled={flushMutation.isPending || t.total_buffered === 0}
                      onClick={() => flushMutation.mutate(t.tenant_id)}
                      aria-label={`Flush queue for ${t.tenant_name}`}
                    >
                      {flushMutation.isPending ? 'Flushing…' : 'Flush now'}
                    </Button>
                  </div>
                );
              })
            )}
            {flushMutation.isError && (
              <p className="border-t border-slate-100 px-4 py-3 text-sm text-rose-600" role="alert">
                Flush failed. Try again or check worker logs.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
