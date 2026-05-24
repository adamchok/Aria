import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export function AdminAnalyticsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'analytics'],
    queryFn: () => api.getAdminAnalytics(),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900">Platform Analytics</h1>
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {isError && <p className="text-sm text-rose-600">Failed to load analytics.</p>}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card><CardContent className="pt-5"><p className="text-xs text-slate-500">Tenants</p><p className="text-2xl font-bold">{data.total_tenants}</p></CardContent></Card>
            <Card><CardContent className="pt-5"><p className="text-xs text-slate-500">Jobs</p><p className="text-2xl font-bold">{data.total_jobs}</p></CardContent></Card>
            <Card><CardContent className="pt-5"><p className="text-xs text-slate-500">Records</p><p className="text-2xl font-bold">{data.total_records}</p></CardContent></Card>
            <Card><CardContent className="pt-5"><p className="text-xs text-slate-500">Match rate</p><p className="text-2xl font-bold">{Math.round(data.avg_match_rate * 100)}%</p></CardContent></Card>
          </div>
          <Card>
            <CardHeader><CardTitle>By tenant</CardTitle></CardHeader>
            <CardContent className="p-0">
              {data.by_tenant.map((t) => (
                <div key={t.tenant_id} className="flex justify-between border-t border-slate-100 px-4 py-3 text-sm first:border-t-0">
                  <span>{t.tenant_name}</span>
                  <span className="text-slate-500">{t.total_jobs} jobs · {Math.round(t.avg_match_rate * 100)}% matched</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
