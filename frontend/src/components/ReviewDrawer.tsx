import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfidenceBadge } from '@/components/ConfidenceBadge';
import { StatusBadge } from '@/components/StatusBadge';
import { formatAmount } from '@/lib/format';
import type { MatchResult, ReviewAction, UUID } from '@/types/api';

interface ReviewDrawerProps {
  match: MatchResult | null;
  baseCurrency: string;
  pending?: boolean;
  onClose: () => void;
  onAction: (action: ReviewAction, payload: { bankEntryId?: UUID; note?: string }) => void;
}

export function ReviewDrawer({ match, baseCurrency, pending, onClose, onAction }: ReviewDrawerProps) {
  const [note, setNote] = useState('');
  const [manualBankEntryId, setManualBankEntryId] = useState('');

  useEffect(() => {
    setNote('');
    setManualBankEntryId('');
  }, [match?.id]);

  if (!match) return null;
  const nr = match.normalised_record;
  const bank = match.bank_entry;

  return (
    <div
      role="dialog"
      aria-label="Review match"
      aria-modal="true"
      className="fixed inset-0 z-30 flex justify-end bg-slate-900/30"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-2xl flex-col gap-4 overflow-y-auto bg-slate-50 p-6 shadow-xl"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Review match</h2>
            <p className="text-sm text-slate-500">{nr.payment.reference ?? 'No reference'}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={match.status} />
            <ConfidenceBadge confidence={match.confidence} />
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Payment proof</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Payer" value={nr.payment.payer} />
              <Row label="Value date" value={nr.payment.value_date} />
              <Row
                label="Amount"
                value={formatAmount(nr.payment.amount_original, nr.payment.currency)}
              />
              <Row
                label="In MYR (settlement)"
                value={formatAmount(nr.amount_myr_at_settlement_rate, baseCurrency)}
              />
              <Row
                label="Tolerance window"
                value={`${formatAmount(nr.tolerance_low, baseCurrency)} – ${formatAmount(
                  nr.tolerance_high,
                  baseCurrency,
                )}`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bank entry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {bank ? (
                <>
                  <Row label="Counterparty" value={bank.counterparty ?? '—'} />
                  <Row label="Value date" value={bank.value_date} />
                  <Row label="Amount" value={formatAmount(bank.amount, bank.currency)} />
                  <Row label="Reference" value={bank.reference ?? '—'} />
                  <Row label="Description" value={bank.description || '—'} />
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  No candidate bank entry was retained. Use Manual match below if you can identify one.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>ARIA reasoning</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            <p>{match.variance_explanation || 'No variance explanation provided.'}</p>
            {match.reasoning_chain ? (
              <details className="rounded border border-slate-200 bg-slate-50 p-3">
                <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-slate-500">
                  Reasoning chain
                </summary>
                <p className="mt-2 whitespace-pre-wrap text-xs text-slate-600">
                  {match.reasoning_chain}
                </p>
              </details>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Decision</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Note (optional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                aria-label="Reviewer note"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                loading={pending}
                onClick={() => onAction('confirm', { note: note || undefined })}
              >
                Confirm match
              </Button>
              <Button
                variant="danger"
                loading={pending}
                onClick={() => onAction('reject', { note: note || undefined })}
              >
                Reject
              </Button>
            </div>
            <div className="rounded border border-slate-200 bg-white px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Manual match
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Paste the bank entry ID you want to attach. Confirms with that entry id.
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={manualBankEntryId}
                  onChange={(e) => setManualBankEntryId(e.target.value)}
                  placeholder="bank entry id"
                  aria-label="Manual bank entry id"
                  className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm focus:border-slate-500 focus:outline-none"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  loading={pending}
                  disabled={!manualBankEntryId}
                  onClick={() =>
                    onAction('manual_match', {
                      bankEntryId: manualBankEntryId,
                      note: note || undefined,
                    })
                  }
                >
                  Manual match
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-right text-sm tabular-nums text-slate-900">{value}</span>
    </div>
  );
}
