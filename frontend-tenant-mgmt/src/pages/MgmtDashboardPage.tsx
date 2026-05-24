import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
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
  const isLoading = analyticsQuery.isLoading || queueQuery.isLoading;
  const isError = analyticsQuery.isError || queueQuery.isError;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Tenant Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Configuration and pipeline overview</p>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-700" role="alert">Failed to load dashboard metrics.</p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={() => void analyticsQuery.refetch()}>
              Retry analytics
            </Button>
            <Button variant="secondary" onClick={() => void queueQuery.refetch()}>
              Retry queue
            </Button>
          </div>
        </div>
      )}

      {!isLoading && !isError && (
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
      )}

      <Card>
        <CardHeader>
          <CardTitle>Quick links</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          <Link to="/keys" className="text-blue-600 hover:text-blue-800">API Keys</Link>
          <Link to="/webhooks" className="text-blue-600 hover:text-blue-800">Webhooks</Link>
          <Link to="/bank-accounts" className="text-blue-600 hover:text-blue-800">Bank Accounts</Link>
          <Link to="/queue" className="text-blue-600 hover:text-blue-800">Queue</Link>
          <Link to="/analytics" className="text-blue-600 hover:text-blue-800">Analytics</Link>
        </CardContent>
      </Card>
    </div>
  );
}
