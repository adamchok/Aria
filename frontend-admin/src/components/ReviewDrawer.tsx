import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfidenceBadge } from '@/components/ConfidenceBadge';
import { StatusBadge } from '@/components/StatusBadge';
import { cn } from '@/lib/cn';
import { formatAmount } from '@/lib/format';
import type { BankEntry, MatchResult, ReviewAction, UUID } from '@/types/api';

interface ReviewDrawerProps {
  match: MatchResult | null;
  baseCurrency: string;
  bankEntries?: BankEntry[];
  bankEntriesLoading?: boolean;
  bankEntriesError?: Error | null;
  pending?: boolean;
  onClose: () => void;
  onAction: (action: ReviewAction, payload: { bankEntryId?: UUID; note?: string }) => void;
}

export function ReviewDrawer({
  match,
  baseCurrency,
  bankEntries = [],
  bankEntriesLoading,
  bankEntriesError,
  pending,
  onClose,
  onAction,
}: ReviewDrawerProps) {
  const [note, setNote] = useState('');
  const [selectedBankEntryId, setSelectedBankEntryId] = useState('');

  const sortedEntries = useMemo(
    () => [...bankEntries].sort((a, b) => b.value_date.localeCompare(a.value_date)),
    [bankEntries],
  );

  useEffect(() => {
    if (!match) return;
    setNote(match.review_notes ?? '');
    setSelectedBankEntryId(match.bank_entry?.id ?? '');
  }, [match?.id, match?.bank_entry?.id, match?.review_notes]);

  if (!match) return null;
  const nr = match.normalised_record;
  const bank = match.bank_entry;
  const reviewed = match.human_reviewed;

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
        className="flex h-full w-full max-w-4xl flex-col gap-4 overflow-y-auto bg-slate-50 p-6 shadow-xl"
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
                  <Row label="Description" value={bank.description || '—'} wrap />
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  No candidate bank entry was retained. Choose a ledger row below to manual match.
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
              <span className="font-medium text-slate-700">
                {reviewed ? 'Reviewer note' : 'Note (optional)'}
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                aria-label="Reviewer note"
              />
            </label>
            {!reviewed ? (
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
            ) : (
              <p className="text-sm text-slate-600" role="status">
                Review recorded. Select a different ledger row below to change the manual match.
              </p>
            )}
            <div className="rounded border border-slate-200 bg-white px-3 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {reviewed ? 'Change manual match' : 'Manual match'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Select the bank ledger row that settles this payment proof. Your note is saved with
                this decision.
              </p>
              {bankEntriesLoading ? (
                <p className="mt-3 text-sm text-slate-500">Loading ledger entries…</p>
              ) : bankEntriesError ? (
                <p className="mt-3 text-sm text-red-600">
                  Unable to load ledger entries. {bankEntriesError.message}
                </p>
              ) : sortedEntries.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">
                  No bank ledger rows are available for this job.
                </p>
              ) : (
                <ul
                  className="mt-3 max-h-56 space-y-2 overflow-y-auto"
                  role="listbox"
                  aria-label="Bank ledger entries"
                >
                  {sortedEntries.map((entry) => {
                    const selected = selectedBankEntryId === entry.id;
                    const label = [
                      entry.value_date,
                      formatAmount(entry.amount, entry.currency),
                      entry.counterparty || entry.reference || entry.description || 'Ledger row',
                    ].join(' · ');
                    return (
                      <li key={entry.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => setSelectedBankEntryId(entry.id)}
                          className={cn(
                            'w-full rounded border px-3 py-2 text-left text-sm transition-colors',
                            selected
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-slate-50 hover:border-slate-400 hover:bg-white',
                          )}
                        >
                          <span className="block font-medium tabular-nums">{label}</span>
                          {(entry.reference || entry.description) && (
                            <span
                              className={cn(
                                'mt-0.5 block text-xs',
                                selected ? 'text-slate-200' : 'text-slate-500',
                              )}
                            >
                              {[entry.reference, entry.description].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="mt-3 flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={pending}
                  disabled={!selectedBankEntryId || bankEntriesLoading}
                  onClick={() =>
                    onAction('manual_match', {
                      bankEntryId: selectedBankEntryId,
                      note: note || undefined,
                    })
                  }
                >
                  {reviewed ? 'Update match' : 'Manual match'}
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

function Row({ label, value, wrap = false }: { label: string; value: string; wrap?: boolean }) {
  return (
    <div className={cn('flex items-start justify-between gap-3', !wrap && 'flex-nowrap')}>
      <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span
        className={cn(
          'text-sm tabular-nums text-slate-900',
          wrap ? 'min-w-0 text-right' : 'shrink-0 whitespace-nowrap text-right',
        )}
      >
        {value}
      </span>
    </div>
  );
}
