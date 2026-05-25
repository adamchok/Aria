import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatAmount, formatDate } from '@/lib/format';
import type { BankAccountUpdate, LedgerEntryCreate, LedgerEntryItem, LedgerEntryUpdate, UUID } from '@/types/api';

const PAGE_SIZE = 50;

function invalidateAccountQueries(qc: ReturnType<typeof useQueryClient>, accountId: string) {
  qc.invalidateQueries({ queryKey: ['bank-account', accountId] });
  qc.invalidateQueries({ queryKey: ['bank-account-statements', accountId] });
  qc.invalidateQueries({ queryKey: ['bank-account-ledger', accountId] });
  qc.invalidateQueries({ queryKey: ['bank-accounts'] });
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  loading,
  onConfirm,
  onClose,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <div className="mt-2 text-sm text-slate-600">{message}</div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Upload statement modal ───────────────────────────────────────────────────

function UploadStatementModal({ accountId, onClose }: { accountId: UUID; onClose: () => void }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: () => api.uploadAccountStatement(accountId, file!),
    onSuccess: () => {
      invalidateAccountQueries(qc, accountId);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

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
            onChange={(e) => {
              setError(null);
              setFile(e.target.files?.[0] ?? null);
            }}
          />
        </label>

        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={upload.isPending} disabled={!file} onClick={() => upload.mutate()}>
            Upload
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit ledger entry modal ──────────────────────────────────────────────────

function EditLedgerEntryModal({
  accountId,
  entry,
  onClose,
}: {
  accountId: UUID;
  entry: LedgerEntryItem;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    value_date: entry.value_date,
    amount: entry.amount,
    currency: entry.currency,
    description: entry.description,
    reference: entry.reference ?? '',
    counterparty: entry.counterparty ?? '',
  });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const payload: LedgerEntryUpdate = {
        value_date: form.value_date,
        amount: form.amount,
        currency: form.currency,
        description: form.description,
        reference: form.reference.trim() || null,
        counterparty: form.counterparty.trim() || null,
      };
      return api.updateLedgerEntry(accountId, entry.id, payload);
    },
    onSuccess: () => {
      invalidateAccountQueries(qc, accountId);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  function field(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-entry-title"
    >
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <h2 id="edit-entry-title" className="mb-4 text-lg font-semibold text-slate-900">
          Edit ledger entry
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Value date
            <input
              type="date"
              value={form.value_date}
              onChange={field('value_date')}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Currency
            <input
              value={form.currency}
              onChange={field('currency')}
              maxLength={3}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm uppercase"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 sm:col-span-2">
            Amount
            <input
              value={form.amount}
              onChange={field('amount')}
              inputMode="decimal"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 sm:col-span-2">
            Description
            <input
              value={form.description}
              onChange={field('description')}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Reference
            <input
              value={form.reference}
              onChange={field('reference')}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Counterparty
            <input
              value={form.counterparty}
              onChange={field('counterparty')}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>Save changes</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit account modal ───────────────────────────────────────────────────────

const CURRENCIES = ['MYR', 'USD', 'EUR', 'GBP', 'SGD'];

function EditAccountModal({
  accountId,
  current,
  onClose,
}: {
  accountId: UUID;
  current: { name: string; bank_name: string; account_number_masked: string; currency: string };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<BankAccountUpdate>({
    name: current.name,
    bank_name: current.bank_name,
    account_number_masked: current.account_number_masked,
    currency: current.currency,
  });
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => api.updateBankAccount(accountId, form),
    onSuccess: () => {
      invalidateAccountQueries(qc, accountId);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  function field(key: keyof BankAccountUpdate) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-account-title"
    >
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <h2 id="edit-account-title" className="mb-4 text-lg font-semibold text-slate-900">
          Edit bank account
        </h2>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Account name
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.name ?? ''}
              onChange={field('name')}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Bank name
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.bank_name ?? ''}
              onChange={field('bank_name')}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Account number (masked)
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.account_number_masked ?? ''}
              onChange={field('account_number_masked')}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Currency
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.currency ?? ''}
              onChange={field('currency')}
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>Save changes</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Add ledger entry modal ───────────────────────────────────────────────────

function AddLedgerEntryModal({
  accountId,
  defaultCurrency,
  onClose,
}: {
  accountId: UUID;
  defaultCurrency: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<LedgerEntryCreate>({
    value_date: today,
    amount: '',
    currency: defaultCurrency,
    description: '',
    reference: null,
    counterparty: null,
  });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.createLedgerEntry(accountId, form),
    onSuccess: () => {
      invalidateAccountQueries(qc, accountId);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  function field(key: keyof LedgerEntryCreate) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-entry-title"
    >
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <h2 id="add-entry-title" className="mb-4 text-lg font-semibold text-slate-900">
          Add ledger entry
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Value date
            <input
              type="date"
              value={form.value_date}
              onChange={field('value_date')}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Currency
            <input
              value={form.currency}
              onChange={field('currency')}
              maxLength={3}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm uppercase"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 sm:col-span-2">
            Amount
            <input
              value={form.amount}
              onChange={field('amount')}
              inputMode="decimal"
              placeholder="e.g. -250.00 for debit"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 sm:col-span-2">
            Description
            <input
              value={form.description ?? ''}
              onChange={field('description')}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Reference
            <input
              value={form.reference ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value || null }))}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Counterparty
            <input
              value={form.counterparty ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, counterparty: e.target.value || null }))}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={create.isPending}
            disabled={!form.value_date || !form.amount || !form.currency}
            onClick={() => create.mutate()}
          >
            Add entry
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Ledger entry row ─────────────────────────────────────────────────────────

function LedgerRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: LedgerEntryItem;
  onEdit: (entry: LedgerEntryItem) => void;
  onDelete: (entry: LedgerEntryItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="border-t border-slate-100 hover:bg-slate-50">
        <td
          className="cursor-pointer py-3 pl-4 pr-3 text-xs text-slate-500"
          onClick={() => setExpanded((e) => !e)}
        >
          {formatDate(entry.value_date)}
        </td>
        <td
          className="cursor-pointer px-3 py-3 text-sm tabular-nums text-slate-900 text-right"
          onClick={() => setExpanded((e) => !e)}
        >
          {formatAmount(entry.amount, entry.currency)}
        </td>
        <td
          className="cursor-pointer px-3 py-3 text-sm text-slate-700 max-w-xs truncate"
          onClick={() => setExpanded((e) => !e)}
        >
          {entry.description || '—'}
        </td>
        <td
          className="cursor-pointer px-3 py-3 text-xs text-slate-500"
          onClick={() => setExpanded((e) => !e)}
        >
          {entry.reference ?? '—'}
        </td>
        <td className="py-3 pl-3 pr-2 text-center">
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
        <td className="py-3 pl-2 pr-4 text-right">
          {entry.cleared ? (
            <span className="text-xs text-slate-400" title="Cleared entries cannot be edited">
              Locked
            </span>
          ) : (
            <div className="flex justify-end gap-1">
              <Button
                size="sm"
                variant="secondary"
                aria-label={`Edit entry ${entry.reference ?? entry.id.slice(0, 8)}`}
                onClick={() => onEdit(entry)}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="danger"
                aria-label={`Delete entry ${entry.reference ?? entry.id.slice(0, 8)}`}
                onClick={() => onDelete(entry)}
              >
                Delete
              </Button>
            </div>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-slate-100 bg-slate-50">
          <td colSpan={6} className="px-4 py-3">
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
                  <dd className="font-mono text-slate-700">{entry.cleared_by_job_id.slice(0, 8)}…</dd>
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
  const [showEditAccount, setShowEditAccount] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);
  const [clearedFilter, setClearedFilter] = useState<ClearedFilter>('all');
  const [page, setPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'ledger' | 'statements'>('ledger');
  const [editingEntry, setEditingEntry] = useState<LedgerEntryItem | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<LedgerEntryItem | null>(null);
  const [deletingStatementId, setDeletingStatementId] = useState<UUID | null>(null);

  const { data: account, isLoading: accLoading, isError: accError } = useQuery({
    queryKey: ['bank-account', accountId],
    queryFn: () => api.getBankAccount(accountId!),
    enabled: !!accountId,
  });

  const { data: statements, isLoading: stmtsLoading } = useQuery({
    queryKey: ['bank-account-statements', accountId],
    queryFn: () => api.listAccountStatements(accountId!),
    enabled: !!accountId,
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

  const deleteEntry = useMutation({
    mutationFn: (entryId: UUID) => api.deleteLedgerEntry(accountId!, entryId),
    onSuccess: () => {
      invalidateAccountQueries(qc, accountId!);
      setDeletingEntry(null);
    },
  });

  const deleteStatement = useMutation({
    mutationFn: (statementId: UUID) => api.deleteAccountStatement(accountId!, statementId),
    onSuccess: () => {
      invalidateAccountQueries(qc, accountId!);
      setDeletingStatementId(null);
    },
  });

  const deletingStatement = statements?.find((s) => s.id === deletingStatementId);

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
          <Button variant="secondary" onClick={() => setShowEditAccount(true)}>
            Edit
          </Button>
          <Button variant="secondary" onClick={() => setShowUpload(true)}>
            Upload statement
          </Button>
          <Button variant="danger" onClick={() => setShowDeleteAccountConfirm(true)}>
            Delete
          </Button>
        </div>
      </div>

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
              <div className="flex items-center gap-3">
                {ledger && <span className="text-sm text-slate-500">{ledger.total} total</span>}
                <Button size="sm" onClick={() => setShowAddEntry(true)}>Add entry</Button>
              </div>
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
                          <th className="py-3 pl-3 pr-2 text-xs font-medium text-slate-500 text-center">Status</th>
                          <th className="py-3 pl-2 pr-4 text-xs font-medium text-slate-500 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ledger.items.map((entry) => (
                          <LedgerRow
                            key={entry.id}
                            entry={entry}
                            onEdit={setEditingEntry}
                            onDelete={setDeletingEntry}
                          />
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
              <p className="p-8 text-center text-sm text-slate-500">No statements uploaded yet.</p>
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
                      <th className="px-3 py-3 text-xs font-medium text-slate-500">Uploaded</th>
                      <th className="py-3 pl-3 pr-4 text-xs font-medium text-slate-500 text-right">Actions</th>
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
                        <td className="px-3 py-3 text-xs text-slate-500">
                          {formatDate(s.created_at.slice(0, 10))}
                        </td>
                        <td className="py-3 pl-3 pr-4 text-right">
                          <Button
                            size="sm"
                            variant="danger"
                            aria-label={`Delete statement ${s.filename}`}
                            onClick={() => setDeletingStatementId(s.id)}
                          >
                            Delete
                          </Button>
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

      {showUpload && (
        <UploadStatementModal accountId={accountId!} onClose={() => setShowUpload(false)} />
      )}

      {showEditAccount && account && (
        <EditAccountModal
          accountId={accountId!}
          current={account}
          onClose={() => setShowEditAccount(false)}
        />
      )}

      {showAddEntry && account && (
        <AddLedgerEntryModal
          accountId={accountId!}
          defaultCurrency={account.currency}
          onClose={() => setShowAddEntry(false)}
        />
      )}

      {editingEntry && (
        <EditLedgerEntryModal
          accountId={accountId!}
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
        />
      )}

      {deletingEntry && (
        <ConfirmDialog
          title="Delete ledger entry?"
          message={
            <>
              Remove <strong>{deletingEntry.description || deletingEntry.reference || 'this entry'}</strong>{' '}
              ({formatAmount(deletingEntry.amount, deletingEntry.currency)}) from the ledger? This cannot be undone.
            </>
          }
          confirmLabel="Delete entry"
          loading={deleteEntry.isPending}
          onConfirm={() => deleteEntry.mutate(deletingEntry.id)}
          onClose={() => setDeletingEntry(null)}
        />
      )}

      {deletingStatement && (
        <ConfirmDialog
          title="Delete statement?"
          message={
            <>
              Delete <strong>{deletingStatement.filename}</strong> and all{' '}
              {deletingStatement.entry_count} ledger {deletingStatement.entry_count === 1 ? 'entry' : 'entries'}?
              Cleared entries will also be removed from this account&apos;s ledger.
            </>
          }
          confirmLabel="Delete statement"
          loading={deleteStatement.isPending}
          onConfirm={() => deleteStatement.mutate(deletingStatement.id)}
          onClose={() => setDeletingStatementId(null)}
        />
      )}

      {showDeleteAccountConfirm && (
        <ConfirmDialog
          title="Delete account?"
          message={
            <>
              This will permanently delete <strong>{account.name}</strong> and all its statements
              and ledger entries. This cannot be undone.
            </>
          }
          confirmLabel="Delete account"
          loading={deleteAccount.isPending}
          onConfirm={() => deleteAccount.mutate()}
          onClose={() => setShowDeleteAccountConfirm(false)}
        />
      )}
    </div>
  );
}
