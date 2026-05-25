import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatPercent } from '@/lib/format';
import type { AIPerformanceSummary, ConfidenceBucket, JobProcessingPoint } from '@/types/api';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─── Shared primitives ────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: string;
  description?: string;
  highlight?: 'green' | 'amber' | 'red' | 'neutral';
  badge?: { text: string; ok: boolean };
}

function MetricCard({ label, value, description, highlight, badge }: MetricCardProps) {
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
        <div className="mt-1 flex items-end gap-2">
          <p className={`text-3xl font-bold tabular-nums ${valueClass}`}>{value}</p>
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
        {description && <p className="mt-0.5 text-xs text-slate-400">{description}</p>}
      </CardContent>
    </Card>
  );
}

// ─── Confidence distribution ──────────────────────────────────────────────────

const BUCKET_COLORS = ['bg-rose-400', 'bg-amber-400', 'bg-blue-400', 'bg-emerald-500'];

function ConfidenceDistribution({ buckets }: { buckets: ConfidenceBucket[] }) {
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);
  return (
    <div className="flex flex-col gap-3">
      {buckets.map((b, i) => (
        <div key={b.label} className="flex items-center gap-3">
          <span className="w-16 text-right text-xs font-medium text-slate-600">{b.label}</span>
          <div className="flex-1">
            <div className="flex h-6 items-center overflow-hidden rounded bg-slate-100">
              <div
                className={`h-full rounded transition-all duration-500 ${BUCKET_COLORS[i]}`}
                style={{ width: `${(b.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
          <span className="w-16 text-right text-xs tabular-nums text-slate-500">
            {b.count} ({formatPercent(b.pct, 0)})
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Donut chart (SVG, no deps) ───────────────────────────────────────────────

interface DonutSlice {
  value: number;
  color: string;
  label: string;
}

function Donut({ slices, size = 120 }: { slices: DonutSlice[]; size?: number }) {
  const r = 40;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const total = slices.reduce((s, sl) => s + sl.value, 0);

  if (total === 0) {
    return (
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={16} />
        <text x={cx} y={cy + 5} textAnchor="middle" fontSize={12} fill="#94a3b8">—</text>
      </svg>
    );
  }

  let offset = 0;
  const paths = slices.map((sl) => {
    const pct = sl.value / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const el = (
      <circle
        key={sl.label}
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={sl.color}
        strokeWidth={16}
        strokeDasharray={`${dash} ${gap}`}
        strokeDashoffset={-offset}
        style={{ transformOrigin: `${cx}px ${cy}px`, transform: 'rotate(-90deg)' }}
      />
    );
    offset += dash;
    return el;
  });

  return (
    <svg width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={16} />
      {paths}
      <text x={cx} y={cy - 6} textAnchor="middle" fontSize={11} fill="#64748b">Total</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={15} fontWeight="bold" fill="#0f172a">
        {total}
      </text>
    </svg>
  );
}

// ─── Processing time sparkline ────────────────────────────────────────────────

function ProcessingSparkline({ jobs, targetSeconds = 60 }: { jobs: JobProcessingPoint[]; targetSeconds?: number }) {
  if (jobs.length === 0) {
    return <p className="py-4 text-center text-sm text-slate-400">No job data in period</p>;
  }

  const W = 480;
  const H = 80;
  const PAD = { top: 8, right: 12, bottom: 24, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const maxSec = Math.max(...jobs.map((j) => j.processing_seconds), targetSeconds * 1.2, 10);
  const xStep = jobs.length > 1 ? chartW / (jobs.length - 1) : chartW;

  const toX = (i: number) => PAD.left + (jobs.length > 1 ? i * xStep : chartW / 2);
  const toY = (sec: number) => PAD.top + chartH - (sec / maxSec) * chartH;

  const points = jobs.map((j, i) => `${toX(i)},${toY(j.processing_seconds)}`).join(' ');
  const targetY = toY(targetSeconds);

  const yTicks = [0, targetSeconds, maxSec].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 240, maxHeight: 100 }}>
        {/* Target line */}
        <line
          x1={PAD.left}
          y1={targetY}
          x2={W - PAD.right}
          y2={targetY}
          stroke="#f59e0b"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
        <text x={W - PAD.right + 2} y={targetY + 4} fontSize={9} fill="#b45309">
          {targetSeconds}s
        </text>

        {/* Y ticks */}
        {yTicks.map((v) => (
          <text key={v} x={PAD.left - 3} y={toY(v) + 4} fontSize={9} textAnchor="end" fill="#94a3b8">
            {v.toFixed(0)}
          </text>
        ))}

        {/* Polyline */}
        <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth={1.5} strokeLinejoin="round" />

        {/* Dots */}
        {jobs.map((j, i) => (
          <circle
            key={j.job_id}
            cx={toX(i)}
            cy={toY(j.processing_seconds)}
            r={3}
            fill={j.processing_seconds < targetSeconds ? '#10b981' : '#f59e0b'}
          />
        ))}

        {/* X axis labels: first + last */}
        {jobs.length > 0 && (
          <>
            <text x={toX(0)} y={H - 4} fontSize={8} textAnchor="middle" fill="#94a3b8">
              {jobs[0].created_at.slice(5, 10)}
            </text>
            {jobs.length > 1 && (
              <text x={toX(jobs.length - 1)} y={H - 4} fontSize={8} textAnchor="middle" fill="#94a3b8">
                {jobs[jobs.length - 1].created_at.slice(5, 10)}
              </text>
            )}
          </>
        )}
      </svg>
    </div>
  );
}

// ─── Target indicator row ─────────────────────────────────────────────────────

function TargetRow({ label, met, detail }: { label: string; met: boolean; detail: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          met ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
        }`}
        aria-label={met ? 'Target met' : 'Target not met'}
      >
        {met ? '✓' : '✗'}
      </span>
      <span className="flex-1 text-sm text-slate-700">{label}</span>
      <span className="text-xs text-slate-500">{detail}</span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const [periodStart, setPeriodStart] = useState(daysAgo(30));
  const [periodEnd, setPeriodEnd] = useState(today());

  const analyticsQuery = useQuery({
    queryKey: ['analytics', 'summary', periodStart, periodEnd],
    queryFn: () => api.getAnalytics({ period_start: periodStart, period_end: periodEnd }),
  });

  const perfQuery = useQuery({
    queryKey: ['analytics', 'performance', periodStart, periodEnd],
    queryFn: () => api.getAIPerformance({ period_start: periodStart, period_end: periodEnd }),
  });

  const data = analyticsQuery.data;
  const perf = perfQuery.data;
  const isLoading = analyticsQuery.isLoading || perfQuery.isLoading;
  const isError = analyticsQuery.isError || perfQuery.isError;

  const maxMatchRate = data ? Math.max(...data.by_corridor.map((c) => c.avg_match_rate), 0.001) : 1;

  function refetchAll() {
    analyticsQuery.refetch();
    perfQuery.refetch();
  }

  const donutSlices: DonutSlice[] = perf
    ? [
        { value: perf.auto_matched_count, color: '#10b981', label: 'Auto-matched' },
        { value: perf.human_confirmed_count, color: '#3b82f6', label: 'Human confirmed' },
        { value: perf.human_rejected_count, color: '#f87171', label: 'Human rejected' },
        {
          value: perf.total_records - perf.auto_matched_count - perf.human_confirmed_count - perf.human_rejected_count,
          color: '#e2e8f0',
          label: 'Unmatched',
        },
      ].filter((s) => s.value > 0)
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">AI Performance</h1>
        <p className="mt-1 text-sm text-slate-500">
          Match accuracy, confidence distribution, and hackathon benchmarks
        </p>
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
            <Button variant="secondary" onClick={refetchAll}>Retry</Button>
          </CardContent>
        </Card>
      )}

      {data && perf && (
        <>
          {/* ── Hackathon target scorecard ── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Hackathon benchmarks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2.5">
                <TargetRow
                  met={perf.match_rate_target_met}
                  label="Match precision ≥ 90% on high-confidence records"
                  detail={`${formatPercent(data.avg_match_rate, 1)} matched`}
                />
                <TargetRow
                  met={perf.escalation_in_target_range}
                  label="Escalation rate 5–20% to human review"
                  detail={`${formatPercent(data.escalation_rate, 1)} escalated`}
                />
                <TargetRow
                  met={perf.processing_target_met}
                  label="Processing latency < 60s per batch"
                  detail={`${perf.avg_processing_seconds.toFixed(1)}s avg`}
                />
                <TargetRow
                  met={perf.total_records > 0}
                  label="Batch capacity up to 200 transactions"
                  detail={`${perf.total_records} records processed`}
                />
              </div>
            </CardContent>
          </Card>

          {/* ── Top KPIs ── */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard
              label="Match rate"
              value={formatPercent(data.avg_match_rate, 1)}
              description={`${data.matched_records} / ${data.total_records} records`}
              highlight={data.avg_match_rate >= 0.9 ? 'green' : data.avg_match_rate >= 0.75 ? 'amber' : 'red'}
              badge={{ text: data.avg_match_rate >= 0.9 ? 'Target met' : 'Below target', ok: data.avg_match_rate >= 0.9 }}
            />
            <MetricCard
              label="Avg confidence"
              value={formatPercent(perf.avg_confidence, 1)}
              description="across all records"
              highlight={perf.avg_confidence >= 0.75 ? 'green' : perf.avg_confidence >= 0.5 ? 'amber' : 'red'}
            />
            <MetricCard
              label="Escalation rate"
              value={formatPercent(data.escalation_rate, 1)}
              description="5–20% target range"
              highlight={
                data.escalation_rate >= 0.05 && data.escalation_rate <= 0.2
                  ? 'green'
                  : data.escalation_rate <= 0.35
                  ? 'amber'
                  : 'red'
              }
              badge={{
                text: perf.escalation_in_target_range ? 'In range' : 'Out of range',
                ok: perf.escalation_in_target_range,
              }}
            />
            <MetricCard
              label="Avg processing"
              value={`${perf.avg_processing_seconds.toFixed(1)}s`}
              description="< 60s target"
              highlight={perf.processing_target_met ? 'green' : 'red'}
              badge={{ text: perf.processing_target_met ? '< 60s ✓' : '> 60s', ok: perf.processing_target_met }}
            />
          </div>

          {/* ── Confidence distribution + Decision breakdown ── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Confidence distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ConfidenceDistribution buckets={perf.confidence_buckets} />
                <p className="mt-3 text-xs text-slate-400">
                  Records below 75% are routed to human review. Records below 50% escalate immediately.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Decision breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <Donut slices={donutSlices} size={120} />
                  <div className="flex flex-col gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-emerald-500" />
                      <span className="text-slate-700">Auto-matched</span>
                      <span className="ml-auto tabular-nums font-medium">{perf.auto_matched_count}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-blue-400" />
                      <span className="text-slate-700">Human confirmed</span>
                      <span className="ml-auto tabular-nums font-medium">{perf.human_confirmed_count}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full bg-rose-400" />
                      <span className="text-slate-700">Human rejected</span>
                      <span className="ml-auto tabular-nums font-medium">{perf.human_rejected_count}</span>
                    </div>
                    {perf.human_confirmed_count + perf.human_rejected_count > 0 && (
                      <div className="mt-1 border-t border-slate-100 pt-1 text-xs text-slate-500">
                        Review confirmation rate:{' '}
                        <span className="font-semibold text-slate-700">
                          {formatPercent(perf.human_review_confirmation_rate, 0)}
                        </span>
                        <span className="ml-1">(AI suggestions accepted)</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Processing time trend ── */}
          {perf.recent_jobs.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Processing time per job</CardTitle>
              </CardHeader>
              <CardContent>
                <ProcessingSparkline jobs={perf.recent_jobs} targetSeconds={60} />
                <p className="mt-1 text-xs text-slate-400">
                  Amber dashed line = 60s target. Green dots = under target, amber = over.
                  Showing last {perf.recent_jobs.length} completed job{perf.recent_jobs.length === 1 ? '' : 's'}.
                </p>
              </CardContent>
            </Card>
          )}

          {/* ── Record status summary ── */}
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

          {/* ── Corridor breakdown ── */}
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
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${
                              c.avg_match_rate >= 0.9
                                ? 'bg-emerald-500'
                                : c.avg_match_rate >= 0.75
                                ? 'bg-blue-500'
                                : 'bg-amber-400'
                            }`}
                            style={{ width: `${(c.avg_match_rate / maxMatchRate) * 100}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs tabular-nums text-slate-600">
                          {formatPercent(c.avg_match_rate, 0)}
                        </span>
                      </div>
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
