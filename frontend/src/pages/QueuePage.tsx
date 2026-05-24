import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

function age(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ${diffMin % 60}m ago`;
}

const TRIGGER_LABELS: Record<string, { label: string; color: string }> = {
  count: { label: 'Count threshold met', color: 'text-amber-700 bg-amber-50' },
  time: { label: 'Time window met', color: 'text-amber-700 bg-amber-50' },
  both: { label: 'Both thresholds met', color: 'text-rose-700 bg-rose-50' },
  none: { label: 'Below thresholds', color: 'text-slate-600 bg-slate-100' },
};

export function QueuePage() {
  const qc = useQueryClient();
  const [flushed, setFlushed] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ingest', 'queue'],
    queryFn: () => api.getQueueStatus(),
    refetchInterval: 10_000,
  });

  const flushMutation = useMutation({
    mutationFn: () => api.flushQueue(),
    onSuccess: () => {
      setFlushed(true);
      void qc.invalidateQueries({ queryKey: ['ingest', 'queue'] });
      setTimeout(() => setFlushed(false), 4_000);
    },
  });

  const trigger = data ? TRIGGER_LABELS[data.next_batch_trigger] ?? TRIGGER_LABELS.none : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Transaction Queue</h1>
        <p className="mt-1 text-sm text-slate-500">
          Buffered transactions waiting for auto-batching into reconciliation jobs
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <div className="h-28 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8">
            <p className="text-sm text-rose-600">Failed to load queue status.</p>
            <Button variant="secondary" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Buffered</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{data.total_buffered}</p>
                <p className="mt-0.5 text-xs text-slate-400">transactions</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Corridors</p>
                <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{data.by_corridor.length}</p>
                <p className="mt-0.5 text-xs text-slate-400">active</p>
              </CardContent>
            </Card>
            {trigger && (
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Batch trigger</p>
                  <span className={`mt-2 inline-block rounded px-2 py-0.5 text-xs font-medium ${trigger.color}`}>
                    {trigger.label}
                  </span>
                </CardContent>
              </Card>
            )}
          </div>

          {/* By corridor */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>By corridor</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.by_corridor.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-500">
                  Queue is empty — no transactions buffered.
                </p>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="py-3 pl-4 pr-3 text-xs font-medium text-slate-500">Corridor</th>
                      <th className="px-3 py-3 text-xs font-medium text-slate-500">Buffered</th>
                      <th className="px-3 py-3 text-xs font-medium text-slate-500">Oldest</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_corridor.map((c) => (
                      <tr key={c.corridor} className="border-t border-slate-100">
                        <td className="py-3 pl-4 pr-3 text-sm font-medium text-slate-800">{c.corridor}</td>
                        <td className="px-3 py-3 text-sm tabular-nums text-slate-700">{c.buffered_count}</td>
                        <td className="px-3 py-3 text-xs text-slate-500">
                          {c.oldest_received_at ? age(c.oldest_received_at) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Manual flush */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Manual flush</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm text-slate-600">
                Force-create a batch job from all buffered transactions now, bypassing the scheduled thresholds.
              </p>
              {flushed && (
                <p className="text-sm font-medium text-emerald-700" role="status">
                  Batch job queued successfully.
                </p>
              )}
              {flushMutation.isError && (
                <p className="text-sm text-rose-600" role="alert">
                  Flush failed. {flushMutation.error instanceof Error ? flushMutation.error.message : 'Unknown error.'}
                </p>
              )}
              <div>
                <Button
                  onClick={() => flushMutation.mutate()}
                  disabled={flushMutation.isPending || data.total_buffered === 0}
                >
                  {flushMutation.isPending ? 'Flushing…' : 'Flush queue now'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
