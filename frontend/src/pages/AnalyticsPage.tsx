import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatPercent } from '@/lib/format';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

interface MetricCardProps {
  label: string;
  value: string;
  description?: string;
  highlight?: 'green' | 'amber' | 'red';
}

function MetricCard({ label, value, description, highlight }: MetricCardProps) {
  const valueClass =
    highlight === 'green'
      ? 'text-emerald-700'
      : highlight === 'amber'
      ? 'text-amber-700'
      : highlight === 'red'
      ? 'text-rose-700'
      : 'text-slate-900';

  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`mt-1 text-3xl font-bold tabular-nums ${valueClass}`}>{value}</p>
        {description && <p className="mt-0.5 text-xs text-slate-400">{description}</p>}
      </CardContent>
    </Card>
  );
}

function CorridorBar({ rate, max }: { rate: number; max: number }) {
  const pct = max > 0 ? (rate / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-blue-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-right text-xs tabular-nums text-slate-600">
        {formatPercent(rate, 0)}
      </span>
    </div>
  );
}

export function AnalyticsPage() {
  const [periodStart, setPeriodStart] = useState(daysAgo(30));
  const [periodEnd, setPeriodEnd] = useState(today());

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics', 'summary', periodStart, periodEnd],
    queryFn: () => api.getAnalytics({ period_start: periodStart, period_end: periodEnd }),
  });

  const maxMatchRate = data
    ? Math.max(...data.by_corridor.map((c) => c.avg_match_rate), 0.001)
    : 1;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">Match precision, escalation rate, and corridor performance</p>
      </div>

      {/* Date range */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600" htmlFor="period-start">From</label>
          <input
            id="period-start"
            type="date"
            value={periodStart}
            max={periodEnd}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600" htmlFor="period-end">To</label>
          <input
            id="period-end"
            type="date"
            value={periodEnd}
            min={periodStart}
            max={today()}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((days) => (
            <button
              key={days}
              onClick={() => { setPeriodStart(daysAgo(days)); setPeriodEnd(today()); }}
              className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-blue-400 hover:text-blue-700"
            >
              Last {days}d
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8">
            <p className="text-sm text-rose-600">Failed to load analytics data.</p>
            <Button variant="secondary" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard
              label="Avg match rate"
              value={formatPercent(data.avg_match_rate, 1)}
              description={`${data.matched_records} / ${data.total_records} records`}
              highlight={data.avg_match_rate >= 0.9 ? 'green' : data.avg_match_rate >= 0.75 ? 'amber' : 'red'}
            />
            <MetricCard
              label="Escalation rate"
              value={formatPercent(data.escalation_rate, 1)}
              description="To human review"
              highlight={data.escalation_rate <= 0.2 ? 'green' : data.escalation_rate <= 0.35 ? 'amber' : 'red'}
            />
            <MetricCard
              label="Avg processing"
              value={`${data.avg_processing_seconds.toFixed(1)}s`}
              description="per batch job"
            />
            <MetricCard
              label="Total jobs"
              value={String(data.total_jobs)}
              description={`${data.total_records} records`}
            />
          </div>

          {/* Record breakdown */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Matched</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">{data.matched_records}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Uncertain</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-amber-700">{data.uncertain_records}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Unmatched</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-rose-700">{data.unmatched_records}</p>
              </CardContent>
            </Card>
          </div>

          {/* Corridor breakdown */}
          {data.by_corridor.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Match rate by corridor</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4">
                  {data.by_corridor.map((c) => (
                    <div key={c.corridor} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-700">{c.corridor}</span>
                        <span className="text-xs text-slate-500">
                          {c.record_count} records · {c.job_count} job{c.job_count === 1 ? '' : 's'}
                        </span>
                      </div>
                      <CorridorBar rate={c.avg_match_rate} max={maxMatchRate} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
