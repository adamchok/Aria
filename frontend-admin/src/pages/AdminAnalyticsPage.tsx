import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { AdminTenantAnalytics } from '@/types/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function pct(n: number, decimals = 1): string {
  return `${(n * 100).toFixed(decimals)}%`;
}

function matchRateColor(rate: number): string {
  if (rate >= 0.9) return 'text-emerald-700';
  if (rate >= 0.75) return 'text-amber-700';
  return 'text-rose-700';
}

function matchRateBarColor(rate: number): string {
  if (rate >= 0.9) return 'bg-emerald-500';
  if (rate >= 0.75) return 'bg-amber-400';
  return 'bg-rose-400';
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: 'violet' | 'green' | 'amber' | 'red' | 'blue' | 'slate';
  badge?: { text: string; ok: boolean };
}

const ACCENT_BORDER: Record<NonNullable<KpiCardProps['accent']>, string> = {
  violet: 'border-l-violet-500',
  green: 'border-l-emerald-500',
  amber: 'border-l-amber-400',
  red: 'border-l-rose-400',
  blue: 'border-l-blue-400',
  slate: 'border-l-slate-300',
};

const ACCENT_VALUE: Record<NonNullable<KpiCardProps['accent']>, string> = {
  violet: 'text-violet-700',
  green: 'text-emerald-700',
  amber: 'text-amber-700',
  red: 'text-rose-700',
  blue: 'text-blue-700',
  slate: 'text-slate-900',
};

function KpiCard({ label, value, sub, accent = 'slate', badge }: KpiCardProps) {
  return (
    <Card className={`overflow-hidden border-l-4 ${ACCENT_BORDER[accent]}`}>
      <CardContent className="pt-5 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
        <div className="mt-1.5 flex items-end gap-2">
          <p className={`text-3xl font-bold tabular-nums leading-none ${ACCENT_VALUE[accent]}`}>{value}</p>
          {badge && (
            <span
              className={`mb-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                badge.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
              }`}
            >
              {badge.text}
            </span>
          )}
        </div>
        {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Health target row ────────────────────────────────────────────────────────

function HealthRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
        }`}
        aria-label={ok ? 'Target met' : 'Target not met'}
      >
        {ok ? '✓' : '✗'}
      </span>
      <span className="flex-1 text-sm text-slate-700">{label}</span>
      <span className="text-xs tabular-nums text-slate-500">{detail}</span>
    </div>
  );
}

// ─── Stacked outcome bar ──────────────────────────────────────────────────────

function OutcomeBar({ matched, uncertain, unmatched }: { matched: number; uncertain: number; unmatched: number }) {
  const total = matched + uncertain + unmatched || 1;
  const mPct = (matched / total) * 100;
  const uPct = (uncertain / total) * 100;
  const nPct = (unmatched / total) * 100;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full bg-emerald-500 transition-all duration-700" style={{ width: `${mPct}%` }} title={`Matched ${mPct.toFixed(1)}%`} />
        <div className="h-full bg-amber-400 transition-all duration-700" style={{ width: `${uPct}%` }} title={`Uncertain ${uPct.toFixed(1)}%`} />
        <div className="h-full bg-rose-400 transition-all duration-700" style={{ width: `${nPct}%` }} title={`Unmatched ${nPct.toFixed(1)}%`} />
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { label: 'Matched', count: matched, pct: mPct, color: 'text-emerald-700', dot: 'bg-emerald-500' },
          { label: 'Uncertain', count: uncertain, pct: uPct, color: 'text-amber-700', dot: 'bg-amber-400' },
          { label: 'Unmatched', count: unmatched, pct: nPct, color: 'text-rose-700', dot: 'bg-rose-400' },
        ].map(({ label, count, pct: p, color, dot }) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${dot}`} />
              <span className="text-xs text-slate-500">{label}</span>
            </div>
            <p className={`text-xl font-bold tabular-nums ${color}`}>{count.toLocaleString()}</p>
            <p className="text-xs text-slate-400">{p.toFixed(1)}%</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tenant row ───────────────────────────────────────────────────────────────

function TenantRow({ t }: { t: AdminTenantAnalytics }) {
  const initial = t.tenant_name.charAt(0).toUpperCase();
  const rate = t.avg_match_rate;
  const escalationOk = t.escalation_rate >= 0.05 && t.escalation_rate <= 0.2;

  return (
    <tr className="group border-t border-slate-100 hover:bg-slate-50 transition-colors">
      {/* Tenant */}
      <td className="py-3 pl-4 pr-3">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700"
            aria-hidden="true"
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">{t.tenant_name}</p>
            <p className="font-mono text-[10px] text-slate-400">{String(t.tenant_id).slice(0, 8)}…</p>
          </div>
        </div>
      </td>

      {/* Match rate bar */}
      <td className="py-3 px-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-700 ${matchRateBarColor(rate)}`}
              style={{ width: `${rate * 100}%` }}
            />
          </div>
          <span className={`text-sm font-semibold tabular-nums ${matchRateColor(rate)}`}>
            {pct(rate, 0)}
          </span>
        </div>
      </td>

      {/* Matched */}
      <td className="py-3 px-3 text-right">
        <span className="text-sm font-medium tabular-nums text-emerald-700">{t.matched_records.toLocaleString()}</span>
      </td>

      {/* Uncertain */}
      <td className="py-3 px-3 text-right">
        <span className={`text-sm font-medium tabular-nums ${t.uncertain_records > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
          {t.uncertain_records.toLocaleString()}
        </span>
      </td>

      {/* Unmatched */}
      <td className="py-3 px-3 text-right">
        <span className={`text-sm font-medium tabular-nums ${t.unmatched_records > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
          {t.unmatched_records.toLocaleString()}
        </span>
      </td>

      {/* Escalation */}
      <td className="py-3 px-3 text-right">
        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
          escalationOk ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
        }`}>
          {pct(t.escalation_rate, 0)}
        </span>
      </td>

      {/* Jobs */}
      <td className="py-3 px-3 text-right text-sm tabular-nums text-slate-600">{t.total_jobs}</td>

      {/* Records */}
      <td className="py-3 px-3 text-right text-sm tabular-nums text-slate-600">{t.total_records.toLocaleString()}</td>

      {/* Link */}
      <td className="py-3 pl-3 pr-4 text-right">
        <Link
          to={`/tenants/${String(t.tenant_id)}`}
          className="text-xs font-medium text-violet-600 hover:text-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"
        >
          Details →
        </Link>
      </td>
    </tr>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AdminAnalyticsPage() {
  const [periodStart, setPeriodStart] = useState(daysAgo(30));
  const [periodEnd, setPeriodEnd] = useState(today());

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'analytics', periodStart, periodEnd],
    queryFn: () => api.getAdminAnalytics({ period_start: periodStart, period_end: periodEnd }),
  });

  const matchRateOk = (data?.avg_match_rate ?? 0) >= 0.9;
  const escalationOk = (data?.escalation_rate ?? 0) >= 0.05 && (data?.escalation_rate ?? 0) <= 0.2;
  const processingOk = (data?.avg_seconds_per_record ?? 0) < 3.0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Platform Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">Cross-tenant AI reconciliation performance</p>
        </div>

        {/* Date range */}
        <div className="flex flex-wrap items-end gap-2">
          {[7, 30, 90].map((days) => (
            <button
              key={days}
              onClick={() => { setPeriodStart(daysAgo(days)); setPeriodEnd(today()); }}
              className={`rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                periodStart === daysAgo(days) && periodEnd === today()
                  ? 'border-violet-400 bg-violet-50 text-violet-700'
                  : 'border-slate-300 text-slate-600 hover:border-violet-400 hover:text-violet-700'
              }`}
            >
              {days}d
            </button>
          ))}
          <input
            type="date"
            value={periodStart}
            max={periodEnd}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-700 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
          <span className="self-center text-xs text-slate-400">–</span>
          <input
            type="date"
            value={periodEnd}
            min={periodStart}
            max={today()}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1.5 text-xs text-slate-700 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8">
            <p className="text-sm text-rose-600" role="alert">Failed to load analytics.</p>
            <Button variant="secondary" onClick={() => void refetch()}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* ── KPI row ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <KpiCard
              label="Tenants"
              value={String(data.total_tenants)}
              sub={`${data.active_tenants} active this period`}
              accent="violet"
            />
            <KpiCard
              label="Jobs processed"
              value={data.total_jobs.toLocaleString()}
              sub="completed reconciliations"
              accent="violet"
            />
            <KpiCard
              label="Records"
              value={data.total_records.toLocaleString()}
              sub="payment records total"
              accent="blue"
            />
            <KpiCard
              label="Match rate"
              value={pct(data.avg_match_rate, 1)}
              sub="≥ 90% target"
              accent={data.avg_match_rate >= 0.9 ? 'green' : data.avg_match_rate >= 0.75 ? 'amber' : 'red'}
              badge={{ text: matchRateOk ? 'On target' : 'Below target', ok: matchRateOk }}
            />
            <KpiCard
              label="Escalation"
              value={pct(data.escalation_rate, 1)}
              sub="5–20% target range"
              accent={escalationOk ? 'green' : 'amber'}
              badge={{ text: escalationOk ? 'In range' : 'Out of range', ok: escalationOk }}
            />
            <KpiCard
              label="Avg per record"
              value={`${data.avg_seconds_per_record.toFixed(1)}s`}
              sub="< 3s target"
              accent={processingOk ? 'green' : 'amber'}
              badge={{ text: processingOk ? '< 3s ✓' : '> 3s', ok: processingOk }}
            />
          </div>

          {/* ── Outcomes + Health ── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Match outcomes</CardTitle>
              </CardHeader>
              <CardContent>
                <OutcomeBar
                  matched={data.matched_records}
                  uncertain={data.uncertain_records}
                  unmatched={data.unmatched_records}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Platform health</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-slate-100">
                  <HealthRow
                    ok={matchRateOk}
                    label="Match precision ≥ 90%"
                    detail={pct(data.avg_match_rate, 1)}
                  />
                  <HealthRow
                    ok={escalationOk}
                    label="Escalation rate 5–20%"
                    detail={pct(data.escalation_rate, 1)}
                  />
                  <HealthRow
                    ok={processingOk}
                    label="Processing < 3s per record"
                    detail={`${data.avg_seconds_per_record.toFixed(1)}s avg`}
                  />
                  <HealthRow
                    ok={data.active_tenants > 0}
                    label="Active tenants this period"
                    detail={`${data.active_tenants} / ${data.total_tenants}`}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Tenant leaderboard ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Tenant leaderboard</CardTitle>
            </CardHeader>
            {data.by_tenant.length === 0 ? (
              <CardContent>
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <p className="text-sm font-medium text-slate-700">No activity in this period</p>
                  <p className="text-xs text-slate-400">Jobs appear here once tenants complete reconciliations.</p>
                </div>
              </CardContent>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left" aria-label="Tenant analytics leaderboard">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="py-2.5 pl-4 pr-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tenant</th>
                      <th className="py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Match rate</th>
                      <th className="py-2.5 px-3 text-right text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Matched</th>
                      <th className="py-2.5 px-3 text-right text-[11px] font-semibold uppercase tracking-wide text-amber-600">Uncertain</th>
                      <th className="py-2.5 px-3 text-right text-[11px] font-semibold uppercase tracking-wide text-rose-600">Unmatched</th>
                      <th className="py-2.5 px-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Escalation</th>
                      <th className="py-2.5 px-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Jobs</th>
                      <th className="py-2.5 px-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Records</th>
                      <th className="py-2.5 pl-3 pr-4 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_tenant.map((t) => (
                      <TenantRow key={String(t.tenant_id)} t={t} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
