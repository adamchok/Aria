import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export function MgmtDashboardPage() {
  const analyticsQuery = useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: () => api.getAnalytics(),
  });

  const queueQuery = useQuery({
    queryKey: ['queue', 'status'],
    queryFn: () => api.getQueueStatus(),
  });

  const summary = analyticsQuery.data;
  const queue = queueQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Tenant Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Configuration and pipeline overview</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase text-slate-500">Completed jobs</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{summary?.total_jobs ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase text-slate-500">Match rate</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              {summary ? `${Math.round(summary.avg_match_rate * 100)}%` : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase text-slate-500">Buffered txns</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{queue?.total_buffered ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase text-slate-500">Batch trigger</p>
            <p className="mt-1 text-lg font-semibold capitalize">{queue?.next_batch_trigger ?? '—'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick links</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          Manage API keys, webhooks, bank accounts, and users from the sidebar.
        </CardContent>
      </Card>
    </div>
  );
}
