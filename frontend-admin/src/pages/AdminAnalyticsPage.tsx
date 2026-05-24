import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

export function AdminAnalyticsPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'analytics'],
    queryFn: () => api.getAdminAnalytics(),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Platform Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">Cross-tenant reconciliation performance</p>
      </div>

      {isLoading && <p className="text-sm text-slate-500" aria-live="polite">Loading analytics…</p>}
      {isError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-700" role="alert">Failed to load analytics.</p>
          <Button variant="secondary" className="mt-2" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-slate-500">Tenants</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900">{data.total_tenants}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-slate-500">Jobs</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900">{data.total_jobs}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-slate-500">Records</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900">{data.total_records}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs text-slate-500">Match rate</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900">
                  {Math.round(data.avg_match_rate * 100)}%
                </p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle>By tenant</CardTitle></CardHeader>
            <CardContent className="p-0">
              {data.by_tenant.length === 0 ? (
                <EmptyState title="No tenant activity" description="Jobs will appear here once tenants reconcile." className="m-4 border-0" />
              ) : (
                data.by_tenant.map((t) => (
                  <div
                    key={t.tenant_id}
                    className="flex flex-wrap justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm first:border-t-0"
                  >
                    <span className="font-medium text-slate-900">{t.tenant_name}</span>
                    <span className="tabular-nums text-slate-500">
                      {t.total_jobs} jobs · {Math.round(t.avg_match_rate * 100)}% matched
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
