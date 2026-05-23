import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { JobStepper } from '@/components/JobStepper';
import { isTerminalStatus, useJobStatus } from '@/hooks/useJobStatus';
import { formatPercent } from '@/lib/format';

export function JobProgressPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const status = useJobStatus(jobId ?? null);

  useEffect(() => {
    if (status.data && status.data.status === 'COMPLETED') {
      navigate(`/jobs/${jobId}/results`, { replace: true });
    }
    if (status.data && status.data.status === 'AWAITING_REVIEW') {
      navigate(`/jobs/${jobId}/review`, { replace: true });
    }
  }, [status.data, jobId, navigate]);

  if (status.isLoading) {
    return <p className="text-sm text-slate-500">Loading job status…</p>;
  }

  if (status.isError || !status.data) {
    return (
      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm text-rose-600" role="alert">
            {status.error?.message ?? 'Unable to load job.'}
          </p>
          <Button variant="secondary" onClick={() => status.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const data = status.data;
  const terminal = isTerminalStatus(data.status);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Job in progress</h1>
        <p className="mt-1 text-sm text-slate-600">
          Job ID <span className="font-mono">{jobId}</span> — status:{' '}
          <span className="font-medium">{data.status}</span>
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Progress</span>
            <span className="font-semibold tabular-nums" aria-live="polite">
              {formatPercent(data.progress_pct / 100, 0)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${Math.min(100, Math.max(0, data.progress_pct))}%` }}
              role="progressbar"
              aria-valuenow={data.progress_pct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <JobStepper status={data.status} agentsCompleted={data.agents_completed} error={data.error} />
          {terminal ? (
            <div className="flex items-center gap-3">
              <Button onClick={() => navigate(`/jobs/${jobId}/results`)}>
                View results
              </Button>
              <Link
                to={`/jobs/${jobId}/review`}
                className="text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Open review queue
              </Link>
            </div>
          ) : (
            <p className="text-sm text-slate-500">You can leave this page — the job continues in the background.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
