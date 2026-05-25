import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { ConfidenceBadge } from '@/components/ConfidenceBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ReviewDrawer } from '@/components/ReviewDrawer';
import { useJobBankEntries } from '@/hooks/useJobBankEntries';
import { useReviewQueue } from '@/hooks/useReviewQueue';
import { useReviewActions } from '@/hooks/useReviewActions';
import { formatAmount } from '@/lib/format';
import { mergeReviewResponse } from '@/lib/reviewMatch';
import type { MatchResult, ReviewAction } from '@/types/api';

export function ReviewPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [active, setActive] = useState<MatchResult | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const queue = useReviewQueue(jobId ?? null);
  const review = useReviewActions(jobId ?? null);
  const bankEntries = useJobBankEntries(jobId ?? null, Boolean(active));

  if (queue.isLoading) {
    return <p className="text-sm text-slate-500">Loading review queue…</p>;
  }
  if (queue.isError || !queue.data) {
    return (
      <EmptyState
        title="Review queue unavailable"
        description={queue.error?.message ?? 'Unable to load uncertain items.'}
        action={
          <Button variant="secondary" onClick={() => queue.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const items = queue.data;

  const handleAction = (action: ReviewAction, payload: { bankEntryId?: string; note?: string }) => {
    if (!jobId || !active) return;
    setReviewError(null);
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
          if (variables.payload.action === 'manual_match') {
            const selected = bankEntries.data?.find((e) => e.id === variables.payload.bank_entry_id);
            setActive(mergeReviewResponse(active, response, selected));
            return;
          }
          setActive(null);
        },
        onError: (err: Error) => {
          setReviewError(err.message || 'Review action failed');
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Human review queue</h1>
          <p className="mt-1 text-sm text-slate-600">
            ARIA routed these to you because confidence sits between 0.50 and 0.75. Confirm,
            reject, or pick a specific bank entry.
          </p>
        </div>
        <Link
          to={`/jobs/${jobId}/results`}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Back to results
        </Link>
      </header>

      {reviewError && (
        <p className="text-sm text-rose-600" role="alert">
          {reviewError}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="No uncertain items"
          description="All matches exceeded the confidence threshold. Nothing left for human review."
          action={
            <Link
              to={`/jobs/${jobId}/results`}
              className="text-sm font-medium text-slate-900 underline"
            >
              View full report
            </Link>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" role="list">
          {items.map((m) => (
            <li key={m.id}>
              <Card>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {m.normalised_record.payment.payer}
                      </p>
                      <p className="text-xs text-slate-500">
                        {m.normalised_record.payment.value_date} ·{' '}
                        {m.normalised_record.payment.reference ?? 'no ref'}
                      </p>
                    </div>
                    <ConfidenceBadge confidence={m.confidence} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Proof</p>
                      <p className="tabular-nums">
                        {formatAmount(
                          m.normalised_record.payment.amount_original,
                          m.normalised_record.payment.currency,
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-500">Bank</p>
                      <p className="tabular-nums">
                        {m.bank_entry
                          ? formatAmount(m.bank_entry.amount, m.bank_entry.currency)
                          : '—'}
                      </p>
                    </div>
                  </div>
                  <p className="line-clamp-2 text-sm text-slate-600">
                    {m.variance_explanation || 'No explanation available.'}
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setActive(m)}>
                      Review
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ReviewDrawer
        match={active}
        baseCurrency={items[0]?.normalised_record.base_currency ?? 'MYR'}
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
