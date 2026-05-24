import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { JobStatusBadge } from '@/components/JobStatusBadge';
import { formatDate } from '@/lib/format';
import type { JobListItem } from '@/types/api';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function MatchRateBar({ matched, uncertain, unmatched, total }: { matched: number; uncertain: number; unmatched: number; total: number }) {
  if (total === 0) return <div className="h-2 w-full rounded-full bg-slate-100" />;
  const matchedPct = (matched / total) * 100;
  const uncertainPct = (uncertain / total) * 100;
  const unmatchedPct = (unmatched / total) * 100;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100" aria-label={`${matched} matched, ${uncertain} uncertain, ${unmatched} unmatched`}>
      <div className="bg-emerald-500" style={{ width: `${matchedPct}%` }} />
      <div className="bg-amber-400" style={{ width: `${uncertainPct}%` }} />
      <div className="bg-rose-400" style={{ width: `${unmatchedPct}%` }} />
    </div>
  );
}

function JobRow({ job }: { job: JobListItem }) {
  const total = job.record_count;
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50">
      <td className="py-3 pl-4 pr-3 text-xs font-mono text-slate-500">{job.job_id.slice(0, 8)}…</td>
      <td className="px-3 py-3">
        <JobStatusBadge status={job.status} />
      </td>
      <td className="px-3 py-3 text-sm tabular-nums text-slate-700">{total}</td>
      <td className="px-3 py-3">
        <div className="flex flex-col gap-1">
          <MatchRateBar
            matched={job.matched_count}
            uncertain={job.uncertain_count}
            unmatched={job.unmatched_count}
            total={total}
          />
          {total > 0 && (
            <span className="text-[10px] text-slate-400">
              {Math.round((job.matched_count / total) * 100)}% matched
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-3 text-xs text-slate-500">{formatDate(job.created_at.slice(0, 10))}</td>
      <td className="py-3 pl-3 pr-4 text-right">
        <Link
          to={`/jobs/${job.job_id}`}
          className="text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          View
        </Link>
      </td>
    </tr>
  );
}

export function DashboardPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['jobs', 'list', { page: 1, page_size: 10 }],
    queryFn: () => api.listJobs({ page: 1, page_size: 10 }),
    refetchInterval: 15_000,
  });

  const items = data?.items ?? [];
  const totalJobs = data?.total ?? 0;

  const totalRecords = items.reduce((s, j) => s + j.record_count, 0);
  const totalMatched = items.reduce((s, j) => s + j.matched_count, 0);
  const totalUncertain = items.reduce((s, j) => s + j.uncertain_count, 0);
  const avgMatchRate = totalRecords > 0 ? Math.round((totalMatched / totalRecords) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Pipeline Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Overview of reconciliation jobs and match rates</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total jobs" value={totalJobs} />
        <StatCard label="Avg match rate" value={`${avgMatchRate}%`} sub="on recent jobs" />
        <StatCard label="Needs review" value={totalUncertain} sub="uncertain matches" />
        <StatCard label="Records processed" value={totalRecords} />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-emerald-500" />
          Matched
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-amber-400" />
          Uncertain
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-rose-400" />
          Unmatched
        </span>
      </div>

      {/* Recent jobs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>Recent Jobs</CardTitle>
          <Link to="/jobs" className="text-xs font-medium text-blue-600 hover:text-blue-800">
            View all
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && (
            <div className="space-y-2 p-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          )}
          {isError && (
            <div className="p-4">
              <p className="text-sm text-rose-600" role="alert">
                Failed to load jobs. Check your session or sign in again.
              </p>
              <Button variant="secondary" className="mt-2" onClick={() => void refetch()}>
                Retry
              </Button>
            </div>
          )}
          {!isLoading && !isError && items.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-500">
              No jobs yet.{' '}
              <Link to="/upload" className="font-medium text-blue-600 hover:text-blue-800">
                Upload files to start reconciling.
              </Link>
            </p>
          )}
          {!isLoading && !isError && items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="py-2 pl-4 pr-3 text-xs font-medium text-slate-500">Job ID</th>
                    <th className="px-3 py-2 text-xs font-medium text-slate-500">Status</th>
                    <th className="px-3 py-2 text-xs font-medium text-slate-500">Records</th>
                    <th className="px-3 py-2 text-xs font-medium text-slate-500">Match rate</th>
                    <th className="px-3 py-2 text-xs font-medium text-slate-500">Created</th>
                    <th className="py-2 pl-3 pr-4" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((job) => (
                    <JobRow key={job.job_id} job={job} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
