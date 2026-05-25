import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Link } from 'react-router-dom';

function matchRateBorderClass(rate: number): string {
  if (rate >= 0.9) return 'border-l-4 border-emerald-500';
  if (rate >= 0.75) return 'border-l-4 border-amber-400';
  return 'border-l-4 border-rose-400';
}

function matchRateBarClass(rate: number): string {
  if (rate >= 0.9) return 'bg-emerald-500';
  if (rate >= 0.75) return 'bg-amber-400';
  return 'bg-rose-400';
}

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
          {/* Summary stat cards with colored left border */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card className="overflow-hidden border-l-4 border-violet-400">
              <CardContent className="pt-5">
                <p className="text-xs text-slate-500">Tenants</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900">{data.total_tenants}</p>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-l-4 border-violet-400">
              <CardContent className="pt-5">
                <p className="text-xs text-slate-500">Jobs</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900">{data.total_jobs}</p>
              </CardContent>
            </Card>
            <Card className="overflow-hidden border-l-4 border-emerald-400">
              <CardContent className="pt-5">
                <p className="text-xs text-slate-500">Records</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900">{data.total_records}</p>
              </CardContent>
            </Card>
            <Card className={`overflow-hidden ${matchRateBorderClass(data.avg_match_rate)}`}>
              <CardContent className="pt-5">
                <p className="text-xs text-slate-500">Match rate</p>
                <p className="text-2xl font-bold tabular-nums text-slate-900">
                  {Math.round(data.avg_match_rate * 100)}%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* By-tenant breakdown */}
          <Card>
            <CardHeader><CardTitle>By tenant</CardTitle></CardHeader>
            <CardContent className="p-0">
              {data.by_tenant.length === 0 ? (
                <EmptyState title="No tenant activity" description="Jobs will appear here once tenants reconcile." className="m-4 border-0" />
              ) : (
                data.by_tenant.map((t) => {
                  const rate = Math.round(t.avg_match_rate * 100);
                  const initial = t.tenant_name.charAt(0).toUpperCase();
                  return (
                    <div
                      key={t.tenant_id}
                      className="flex items-center gap-3 border-t border-slate-100 px-4 py-3 hover:bg-slate-50 transition-colors first:border-t-0"
                    >
                      {/* Tenant initial avatar */}
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700" aria-hidden="true">
                        {initial}
                      </span>

                      {/* Name + ID */}
                      <div className="min-w-0 w-32 shrink-0">
                        <p className="truncate text-sm font-medium text-slate-900">{t.tenant_name}</p>
                        <p className="truncate font-mono text-xs text-slate-400">{t.tenant_id.slice(0, 8)}</p>
                      </div>

                      {/* Match rate bar */}
                      <div className="flex flex-1 items-center gap-2 min-w-0">
                        <div className="h-1.5 flex-1 rounded-full bg-slate-100" aria-hidden="true">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${matchRateBarClass(t.avg_match_rate)}`}
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                      </div>

                      {/* Stats + link */}
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-slate-500 tabular-nums">
                          {t.total_jobs} jobs · {rate}% matched
                        </span>
                        <Link
                          to={`/tenants/${t.tenant_id}`}
                          className="text-xs font-medium text-violet-600 hover:text-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"
                        >
                          View details
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
