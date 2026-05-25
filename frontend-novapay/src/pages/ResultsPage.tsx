import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ReconciliationGrid } from '@/components/ReconciliationGrid';
import { ReviewDrawer } from '@/components/ReviewDrawer';
import { SummaryCards } from '@/components/SummaryCards';
import { api } from '@/api/client';
import { useJobBankEntries } from '@/hooks/useJobBankEntries';
import { useResults } from '@/hooks/useResults';
import { useReviewActions } from '@/hooks/useReviewActions';
import { formatNarrative } from '@/lib/format';
import { mergeReviewResponse } from '@/lib/reviewMatch';
import type { MatchResult, ReviewAction } from '@/types/api';

export function ResultsPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [active, setActive] = useState<MatchResult | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (!jobId || exporting) return;
    setExporting(true);
    try {
      const blob = await api.exportJobResults(jobId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reconciliation-${jobId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }, [jobId, exporting]);
  const results = useResults(jobId ?? null);
  const review = useReviewActions(jobId ?? null);
  const bankEntries = useJobBankEntries(jobId ?? null, Boolean(active));

  useEffect(() => {
    if (!active || !results.data) return;
    const fresh = results.data.matches.find((m) => m.id === active.id);
    if (!fresh) return;
    if (
      fresh.bank_entry?.id !== active.bank_entry?.id ||
      fresh.review_notes !== active.review_notes ||
      fresh.status !== active.status
    ) {
      setActive(fresh);
    }
  }, [results.data, active?.id]);

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
  const { summary } = report;
  const hasReview = summary.uncertain_count > 0;
  const hasUnmatched = summary.unmatched_count > 0;

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
        onSuccess: (response, variables) => {
          if (variables.payload.action === 'manual_match' && active) {
            const selected = bankEntries.data?.find((e) => e.id === variables.payload.bank_entry_id);
            setActive(mergeReviewResponse(active, response, selected));
          } else {
            setActive(null);
          }
          void results.refetch();
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Reconciliation results</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" loading={exporting} onClick={() => void handleExport()}>
            Export Excel
          </Button>
          <Link
            to={`/jobs/${report.job_id}/review`}
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Open review queue
          </Link>
        </div>
      </header>

      {(hasReview || hasUnmatched) && (
        <div className="flex flex-col gap-3">
          {hasReview && (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
              role="status"
            >
              <p className="text-sm text-amber-900">
                {summary.uncertain_count} item{summary.uncertain_count === 1 ? '' : 's'} need human review
                (confidence 50–75%).
              </p>
              <Link to={`/jobs/${report.job_id}/review`}>
                <Button variant="secondary">Review queue</Button>
              </Link>
            </div>
          )}
          {hasUnmatched && (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3"
              role="status"
            >
              <p className="text-sm text-rose-900">
                {summary.unmatched_count} unmatched item{summary.unmatched_count === 1 ? '' : 's'} — filter the
                grid below or open the detail drawer for ARIA&apos;s explanation.
              </p>
            </div>
          )}
        </div>
      )}

      {report.narrative ? (
        <Card>
          <CardHeader>
            <CardTitle>Executive summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="w-full text-sm leading-relaxed text-slate-600 text-pretty">
              {formatNarrative(report.narrative)}
            </p>
          </CardContent>
        </Card>
      ) : null}

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
        bankEntries={bankEntries.data ?? []}
        bankEntriesLoading={bankEntries.isLoading}
        bankEntriesError={bankEntries.error}
        pending={review.isPending}
        onClose={() => setActive(null)}
        onAction={handleAction}
      />
    </div>
  );
}
