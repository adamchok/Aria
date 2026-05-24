import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/format';
import type { BankAccountCreate } from '@/types/api';

// ─── Create account modal ─────────────────────────────────────────────────────

const CURRENCIES = ['MYR', 'USD', 'EUR', 'GBP', 'SGD'];

function CreateAccountModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<BankAccountCreate>({
    name: '',
    bank_name: '',
    account_number_masked: '',
    currency: 'MYR',
  });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.createBankAccount(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  function field(key: keyof BankAccountCreate) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-account-title"
    >
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <h2 id="create-account-title" className="mb-4 text-lg font-semibold text-slate-900">
          Add bank account
        </h2>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Account name
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Main Operating Account"
              value={form.name}
              onChange={field('name')}
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Bank name
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Maybank"
              value={form.bank_name}
              onChange={field('bank_name')}
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Account number (masked)
            <input
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="****1234"
              value={form.account_number_masked}
              onChange={field('account_number_masked')}
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            Currency
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.currency}
              onChange={field('currency')}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={create.isPending}
            disabled={!form.name || !form.bank_name || !form.account_number_masked}
            onClick={() => create.mutate()}
          >
            Add account
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function BankAccountsPage() {
  const [showCreate, setShowCreate] = useState(false);

  const { data: accounts, isLoading, isError, refetch } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => api.listBankAccounts(),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Bank Accounts</h1>
          <p className="mt-1 text-sm text-slate-500">
            {accounts ? `${accounts.length} account${accounts.length === 1 ? '' : 's'}` : 'Loading…'}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>Add account</Button>
      </div>

      {isError && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-8">
          <p className="text-sm text-rose-600">Failed to load bank accounts.</p>
          <Button variant="secondary" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      )}

      {!isLoading && !isError && accounts?.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-slate-900">No bank accounts yet</p>
          <p className="text-sm text-slate-500">
            Add a bank account to start uploading monthly statements and reconciling transactions.
          </p>
          <Button onClick={() => setShowCreate(true)}>Add account</Button>
        </div>
      )}

      {!isLoading && !isError && accounts && accounts.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((acc) => (
            <Link
              key={acc.id}
              to={`/bank-accounts/${acc.id}`}
              className="block rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{acc.name}</p>
                  <p className="mt-0.5 text-sm text-slate-500">{acc.bank_name} · {acc.account_number_masked}</p>
                </div>
                <span className="flex-shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                  {acc.currency}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
                <div className="text-center">
                  <p className="tabular-nums text-lg font-semibold text-slate-900">{acc.statement_count}</p>
                  <p className="mt-0.5 text-xs text-slate-500">Statements</p>
                </div>
                <div className="text-center">
                  <p className="tabular-nums text-lg font-semibold text-slate-900">{acc.entry_count}</p>
                  <p className="mt-0.5 text-xs text-slate-500">Entries</p>
                </div>
                <div className="text-center">
                  <p className={`tabular-nums text-lg font-semibold ${acc.uncleared_count > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {acc.uncleared_count}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">Uncleared</p>
                </div>
              </div>

              <p className="mt-3 text-xs text-slate-400">Added {formatDate(acc.created_at.slice(0, 10))}</p>
            </Link>
          ))}
        </div>
      )}

      {showCreate && <CreateAccountModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
