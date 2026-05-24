import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatAmount, formatDate } from '@/lib/format';
import type { LedgerEntryItem, UUID } from '@/types/api';

const PAGE_SIZE = 50;

// ─── Upload statement modal ───────────────────────────────────────────────────

function UploadStatementModal({ accountId, onClose }: { accountId: UUID; onClose: () => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: () => api.uploadAccountStatement(accountId, file!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-account', accountId] });
      qc.invalidateQueries({ queryKey: ['bank-account-statements', accountId] });
      qc.invalidateQueries({ queryKey: ['bank-account-ledger', accountId] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setFile(e.target.files?.[0] ?? null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-statement-title"
    >
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <h2 id="upload-statement-title" className="mb-4 text-lg font-semibold text-slate-900">
          Upload bank statement
        </h2>

        <label className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-slate-300 p-8 text-center hover:border-slate-400">
          <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 8l-4-4-4 4M12 4v12" />
          </svg>
          {file ? (
            <span className="text-sm font-medium text-slate-900">{file.name}</span>
          ) : (
            <>
              <span className="text-sm text-slate-500">Click to select XLSX, CSV, or PDF</span>
              <span className="text-xs text-slate-400">Bank statement for this account</span>
            </>
          )}
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.pdf"
            className="sr-only"
            onChange={handleFile}
          />
        </label>

        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={upload.isPending}
            disabled={!file}
            onClick={() => upload.mutate()}
          >
            Upload
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Ledger entry row ─────────────────────────────────────────────────────────

function LedgerRow({ entry }: { entry: LedgerEntryItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <td className="py-3 pl-4 pr-3 text-xs text-slate-500">{formatDate(entry.value_date)}</td>
        <td className="px-3 py-3 text-sm tabular-nums text-slate-900 text-right">
          {formatAmount(entry.amount, entry.currency)}
        </td>
        <td className="px-3 py-3 text-sm text-slate-700 max-w-xs truncate">{entry.description || '—'}</td>
        <td className="px-3 py-3 text-xs text-slate-500">{entry.reference ?? '—'}</td>
        <td className="py-3 pl-3 pr-4 text-center">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              entry.cleared
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-700'
            }`}
          >
            {entry.cleared ? 'Cleared' : 'Pending'}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-slate-100 bg-slate-50">
          <td colSpan={5} className="px-4 py-3">
            <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs sm:grid-cols-4">
              <div>
                <dt className="text-slate-500">Entry ID</dt>
                <dd className="font-mono text-slate-700">{entry.id.slice(0, 8)}…</dd>
              </div>
              <div>
                <dt className="text-slate-500">Statement</dt>
                <dd className="truncate text-slate-700">{entry.statement_filename}</dd>
              </div>
              {entry.counterparty && (
                <div>
                  <dt className="text-slate-500">Counterparty</dt>
                  <dd className="text-slate-700">{entry.counterparty}</dd>
                </div>
              )}
              {entry.cleared_by_job_id && (
                <div>
                  <dt className="text-slate-500">Cleared by job</dt>
                  <dd className="font-mono text-slate-700">
                    <Link
                      to={`/jobs/${entry.cleared_by_job_id}`}
                      className="text-blue-600 hover:text-blue-800"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {entry.cleared_by_job_id.slice(0, 8)}…
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type ClearedFilter = 'all' | 'cleared' | 'pending';

const CLEARED_TABS: { label: string; value: ClearedFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Cleared', value: 'cleared' },
  { label: 'Pending', value: 'pending' },
];

export function BankAccountDetailPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [showUpload, setShowUpload] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [clearedFilter, setClearedFilter] = useState<ClearedFilter>('all');
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'ledger' | 'statements'>('ledger');

  const { data: account, isLoading: accLoading, isError: accError } = useQuery({
    queryKey: ['bank-account', accountId],
    queryFn: () => api.getBankAccount(accountId!),
    enabled: !!accountId,
  });

  const { data: statements, isLoading: stmtsLoading } = useQuery({
    queryKey: ['bank-account-statements', accountId],
    queryFn: () => api.listAccountStatements(accountId!),
    enabled: !!accountId && activeTab === 'statements',
  });

  const clearedParam = clearedFilter === 'all' ? undefined : clearedFilter === 'cleared';

  const { data: ledger, isLoading: ledgerLoading } = useQuery({
    queryKey: ['bank-account-ledger', accountId, { clearedFilter, page }],
    queryFn: () => api.getAccountLedger(accountId!, { cleared: clearedParam, page, page_size: PAGE_SIZE }),
    enabled: !!accountId && activeTab === 'ledger',
  });

  const deleteAccount = useMutation({
    mutationFn: () => api.deleteBankAccount(accountId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      navigate('/bank-accounts');
    },
  });

  if (accLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
        <div className="h-40 animate-pulse rounded-lg bg-slate-100" />
      </div>
    );
  }

  if (accError || !account) {
    return (
      <div className="flex flex-col items-center gap-3 p-12 text-center">
        <p className="text-sm text-rose-600">Bank account not found.</p>
        <Link to="/bank-accounts">
          <Button variant="secondary">Back to accounts</Button>
        </Link>
      </div>
    );
  }

  const totalPages = ledger ? Math.ceil(ledger.total / PAGE_SIZE) : 1;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link to="/bank-accounts" className="hover:text-slate-700">Bank Accounts</Link>
            <span aria-hidden="true">/</span>
            <span className="text-slate-900 font-medium">{account.name}</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{account.name}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {account.bank_name} · {account.account_number_masked} · {account.currency}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowUpload(true)}>
            Upload statement
          </Button>
          <Button variant="danger" onClick={() => setShowDeleteConfirm(true)}>
            Delete
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Statements', value: account.statement_count },
          { label: 'Total entries', value: account.entry_count },
          {
            label: 'Uncleared',
            value: account.uncleared_count,
            highlight: account.uncleared_count > 0,
          },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="py-4 text-center">
              <p className={`tabular-nums text-3xl font-semibold ${s.highlight ? 'text-amber-700' : 'text-slate-900'}`}>
                {s.value}
              </p>
              <p className="mt-1 text-sm text-slate-500">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {(['ledger', 'statements'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-3 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === t
                ? 'border-b-2 border-blue-600 text-blue-700'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Ledger tab */}
      {activeTab === 'ledger' && (
        <>
          <div className="flex gap-1">
            {CLEARED_TABS.map((f) => (
              <button
                key={f.value}
                onClick={() => { setClearedFilter(f.value); setPage(1); }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  clearedFilter === f.value
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle>Ledger entries</CardTitle>
              {ledger && (
                <span className="text-sm text-slate-500">{ledger.total} total</span>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {ledgerLoading && (
                <div className="space-y-2 p-4">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />
                  ))}
                </div>
              )}
              {!ledgerLoading && ledger?.items.length === 0 && (
                <p className="p-8 text-center text-sm text-slate-500">
                  {clearedFilter === 'all'
                    ? 'No entries yet. Upload a statement to populate the ledger.'
                    : `No ${clearedFilter} entries.`}
                </p>
              )}
              {!ledgerLoading && ledger && ledger.items.length > 0 && (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          <th className="py-3 pl-4 pr-3 text-xs font-medium text-slate-500">Value date</th>
                          <th className="px-3 py-3 text-xs font-medium text-slate-500 text-right">Amount</th>
                          <th className="px-3 py-3 text-xs font-medium text-slate-500">Description</th>
                          <th className="px-3 py-3 text-xs font-medium text-slate-500">Reference</th>
                          <th className="py-3 pl-3 pr-4 text-xs font-medium text-slate-500 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.items.map((entry) => (
                          <LedgerRow key={entry.id} entry={entry} />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
                      <p className="text-xs text-slate-500">Page {page} of {totalPages}</p>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={page === 1}
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={page === totalPages}
                          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
        </>
      )}

      {/* Statements tab */}
      {activeTab === 'statements' && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle>Statements</CardTitle>
            <Button size="sm" onClick={() => setShowUpload(true)}>Upload</Button>
          </CardHeader>
          <CardContent className="p-0">
            {stmtsLoading && (
              <div className="space-y-2 p-4">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded bg-slate-100" />
                ))}
              </div>
            )}
            {!stmtsLoading && statements?.length === 0 && (
              <p className="p-8 text-center text-sm text-slate-500">
                No statements uploaded yet.
              </p>
            )}
            {!stmtsLoading && statements && statements.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="py-3 pl-4 pr-3 text-xs font-medium text-slate-500">Filename</th>
                      <th className="px-3 py-3 text-xs font-medium text-slate-500">Period</th>
                      <th className="px-3 py-3 text-xs font-medium text-slate-500 text-right">Entries</th>
                      <th className="px-3 py-3 text-xs font-medium text-slate-500 text-right">Uncleared</th>
                      <th className="py-3 pl-3 pr-4 text-xs font-medium text-slate-500">Uploaded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statements.map((s) => (
                      <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="py-3 pl-4 pr-3 text-sm font-medium text-slate-900">{s.filename}</td>
                        <td className="px-3 py-3 text-sm text-slate-600">
                          {s.statement_period_start && s.statement_period_end
                            ? `${formatDate(s.statement_period_start)} – ${formatDate(s.statement_period_end)}`
                            : '—'}
                        </td>
                        <td className="px-3 py-3 text-sm tabular-nums text-slate-700 text-right">{s.entry_count}</td>
                        <td className="px-3 py-3 text-sm tabular-nums text-right">
                          <span className={s.uncleared_count > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                            {s.uncleared_count}
                          </span>
                        </td>
                        <td className="py-3 pl-3 pr-4 text-xs text-slate-500">
                          {formatDate(s.created_at.slice(0, 10))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadStatementModal accountId={accountId!} onClose={() => setShowUpload(false)} />
      )}

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Delete account?</h2>
            <p className="mt-2 text-sm text-slate-600">
              This will permanently delete <strong>{account.name}</strong> and all its statements
              and ledger entries. This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
              <Button
                variant="danger"
                loading={deleteAccount.isPending}
                onClick={() => deleteAccount.mutate()}
              >
                Delete account
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
