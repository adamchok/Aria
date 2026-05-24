import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

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
              <span className="tabular-nums">{queueQuery.data.total_buffered_system}</span> buffered
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {queueQuery.data.tenants.length === 0 ? (
              <EmptyState
                title="Queue empty"
                description="No tenants have buffered transactions."
                className="m-4 border-0"
              />
            ) : (
              queueQuery.data.tenants.map((t) => (
                <div
                  key={t.tenant_id}
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 first:border-t-0"
                >
                  <div>
                    <p className="font-medium text-slate-900">{t.tenant_name}</p>
                    <p className="text-xs text-slate-500">
                      <span className="tabular-nums">{t.total_buffered}</span> buffered · trigger: {t.next_batch_trigger}
                    </p>
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
              ))
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
