import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { JobStatusBadge } from '@/components/JobStatusBadge';
import { formatDateTime } from '@/lib/format';
import { JobStatus } from '@/types/api';
import type { JobListItem, JobStatus as JobStatusType, UUID } from '@/types/api';

const STATUS_FILTERS: { label: string; value: JobStatusType | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Running', value: JobStatus.INGESTING },
  { label: 'Awaiting review', value: JobStatus.AWAITING_REVIEW },
  { label: 'Completed', value: JobStatus.COMPLETED },
  { label: 'Failed', value: JobStatus.FAILED },
  { label: 'Cancelled', value: JobStatus.CANCELLED },
];

const TERMINAL_STATUSES: Set<JobStatusType> = new Set([
  JobStatus.COMPLETED,
  JobStatus.FAILED,
  JobStatus.CANCELLED,
]);

const CANCELLABLE_STATUSES: Set<JobStatusType> = new Set([
  JobStatus.PENDING,
  JobStatus.INGESTING,
  JobStatus.NORMALISING,
  JobStatus.MATCHING,
  JobStatus.REPORTING,
  JobStatus.AWAITING_REVIEW,
]);

const PAGE_SIZE = 20;

function ConfirmButton({
  label,
  confirmLabel,
  onClick,
  className,
}: {
  label: string;
  confirmLabel: string;
  onClick: () => void;
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="flex items-center gap-1">
        <button
          onClick={() => {
            setConfirming(false);
            onClick();
          }}
          className={`text-xs font-medium underline ${className ?? ''}`}
        >
          {confirmLabel}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-slate-400 underline hover:text-slate-600"
        >
          No
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className={`text-xs font-medium underline ${className ?? ''}`}
    >
      {label}
    </button>
  );
}

function JobActions({ job }: { job: JobListItem }) {
  const qc = useQueryClient();

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelJob(job.job_id as UUID),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['jobs', 'list'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteJob(job.job_id as UUID),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['jobs', 'list'] }),
  });

  const isTerminal = TERMINAL_STATUSES.has(job.status);
  const isCancellable = CANCELLABLE_STATUSES.has(job.status);

  return (
    <span className="flex items-center justify-end gap-3">
      <Link
        to={`/jobs/${job.job_id}`}
        className="text-xs font-medium text-blue-600 hover:text-blue-800"
      >
        View
      </Link>
      {isCancellable && (
        <ConfirmButton
          label={cancelMutation.isPending ? 'Cancelling…' : 'Cancel'}
          confirmLabel="Yes, cancel"
          onClick={() => cancelMutation.mutate()}
          className="text-amber-700 hover:text-amber-900"
        />
      )}
      {isTerminal && (
        <ConfirmButton
          label={deleteMutation.isPending ? 'Deleting…' : 'Delete'}
          confirmLabel="Yes, delete"
          onClick={() => deleteMutation.mutate()}
          className="text-rose-600 hover:text-rose-800"
        />
      )}
    </span>
  );
}

export function JobsPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<JobStatusType | ''>('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['jobs', 'list', { page, status: statusFilter }],
    queryFn: () =>
      api.listJobs({
        page,
        page_size: PAGE_SIZE,
        status: statusFilter || undefined,
      }),
    refetchInterval: 10_000,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function handleStatusFilter(value: JobStatusType | '') {
    setStatusFilter(value);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Jobs</h1>
          <p className="mt-1 text-sm text-slate-500">
            {total > 0 ? `${total} total job${total === 1 ? '' : 's'}` : 'No jobs found'}
          </p>
        </div>
        <Link to="/upload">
          <Button>New job</Button>
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => handleStatusFilter(f.value)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              statusFilter === f.value
                ? 'border-b-2 border-blue-600 text-blue-700'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Job list</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && (
            <div className="space-y-2 p-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          )}
          {isError && (
            <div className="flex flex-col items-center gap-3 p-8">
              <p className="text-sm text-rose-600">Failed to load jobs.</p>
              <Button variant="secondary" onClick={() => refetch()}>Retry</Button>
            </div>
          )}
          {!isLoading && !isError && items.length === 0 && (
            <p className="p-8 text-center text-sm text-slate-500">No jobs match the current filter.</p>
          )}
          {!isLoading && !isError && items.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="py-3 pl-4 pr-3 text-xs font-medium text-slate-500">Job ID</th>
                      <th className="px-3 py-3 text-xs font-medium text-slate-500">Status</th>
                      <th className="px-3 py-3 text-xs font-medium text-slate-500">Currency</th>
                      <th className="px-3 py-3 text-xs font-medium text-slate-500">Records</th>
                      <th className="px-3 py-3 text-xs font-medium text-slate-500">Matched</th>
                      <th className="px-3 py-3 text-xs font-medium text-slate-500">Uncertain</th>
                      <th className="px-3 py-3 text-xs font-medium text-slate-500">Created</th>
                      <th className="py-3 pl-3 pr-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((job) => (
                      <tr key={job.job_id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="py-3 pl-4 pr-3 text-xs font-mono text-slate-500">
                          {job.job_id.slice(0, 8)}…
                        </td>
                        <td className="px-3 py-3">
                          <JobStatusBadge status={job.status} />
                        </td>
                        <td className="px-3 py-3 text-sm font-medium text-slate-700">{job.base_currency}</td>
                        <td className="px-3 py-3 text-sm tabular-nums text-slate-700">{job.record_count}</td>
                        <td className="px-3 py-3 text-sm tabular-nums text-emerald-700">{job.matched_count}</td>
                        <td className="px-3 py-3 text-sm tabular-nums text-amber-700">{job.uncertain_count}</td>
                        <td className="px-3 py-3 text-xs text-slate-500">{formatDateTime(job.created_at)}</td>
                        <td className="py-3 pl-3 pr-4 text-right">
                          <JobActions job={job} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
                  <p className="text-xs text-slate-500">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
