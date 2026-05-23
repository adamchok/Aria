import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ReconciliationGrid } from '@/components/ReconciliationGrid';
import { ReviewDrawer } from '@/components/ReviewDrawer';
import { SummaryCards } from '@/components/SummaryCards';
import { api } from '@/api/client';
import { useResults } from '@/hooks/useResults';
import { useReviewActions } from '@/hooks/useReviewActions';
import type { MatchResult, ReviewAction } from '@/types/api';

export function ResultsPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const results = useResults(jobId ?? null);
  const review = useReviewActions(jobId ?? null);
  const [active, setActive] = useState<MatchResult | null>(null);

  if (results.isLoading) {
    return <p className="text-sm text-slate-500">Loading reconciliation report…</p>;
  }
  if (results.isError || !results.data) {
    return (
      <EmptyState
        title="Report not available yet"
        description={results.error?.message ?? 'The job may still be running.'}
        action={
          <Button variant="secondary" onClick={() => results.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }
  const report = results.data;

  const handleAction = (action: ReviewAction, payload: { bankEntryId?: string; note?: string }) => {
    if (!jobId || !active) return;
    review.mutate(
      {
        jobId,
        matchId: active.id,
        payload: {
          action,
          bank_entry_id: payload.bankEntryId,
          note: payload.note,
        },
      },
      {
        onSuccess: () => {
          setActive(null);
          void results.refetch();
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Reconciliation results</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{report.narrative}</p>
        </div>
        <div className="flex items-center gap-2">
          <a href={api.exportUrl(report.job_id)} download>
            <Button variant="secondary">Export Excel</Button>
          </a>
          <Link
            to={`/jobs/${report.job_id}/review`}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Open review queue
          </Link>
        </div>
      </header>

      <SummaryCards summary={report.summary} baseCurrency={report.base_currency} />

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {report.matches.length === 0 ? (
            <EmptyState
              title="No matches yet"
              description="No payment records were extracted. Re-run with clearer documents or check the audit log."
            />
          ) : (
            <ReconciliationGrid
              matches={report.matches}
              baseCurrency={report.base_currency}
              onRowClick={setActive}
            />
          )}
        </CardContent>
      </Card>

      <ReviewDrawer
        match={active}
        baseCurrency={report.base_currency}
        pending={review.isPending}
        onClose={() => setActive(null)}
        onAction={handleAction}
      />
    </div>
  );
}
