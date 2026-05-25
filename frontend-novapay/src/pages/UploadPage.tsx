import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { UploadDropzone } from '@/components/UploadDropzone';
import { FileList } from '@/components/FileList';
import { useUploadStore } from '@/stores/upload-store';
import { useCreateJob } from '@/hooks/useCreateJob';
import type { BankStatementSource } from '@/stores/upload-store';

const CURRENCIES = ['MYR', 'USD', 'EUR', 'GBP', 'SGD'];

const BANK_STATEMENT_EXTENSIONS = ['.xlsx', '.csv', '.pdf'] as const;
const BANK_STATEMENT_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
  'application/pdf',
]);

const SOURCE_OPTIONS: { value: BankStatementSource; label: string }[] = [
  { value: 'upload', label: 'Upload file' },
  { value: 'ledger', label: 'From bank account' },
];

export function UploadPage() {
  const navigate = useNavigate();
  const {
    paymentProofs,
    bankStatement,
    bankStatementSource,
    selectedAccountId,
    baseCurrency,
    addPaymentProofs,
    removePaymentProof,
    setBankStatement,
    setBankStatementSource,
    setSelectedAccountId,
    setBaseCurrency,
    reset,
  } = useUploadStore();
  const createJob = useCreateJob();

  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => api.listBankAccounts(),
    enabled: bankStatementSource === 'ledger',
  });

  const selectedAccount = accounts?.find((acc) => acc.id === selectedAccountId);

  const hasBankData =
    bankStatementSource === 'upload'
      ? bankStatement !== null
      : !!selectedAccountId && (selectedAccount?.uncleared_count ?? 0) > 0;

  const canSubmit = paymentProofs.length > 0 && hasBankData && !createJob.isPending;

  const onSubmit = () => {
    if (!hasBankData) return;
    createJob.mutate(
      {
        paymentProofs,
        bankStatement: bankStatementSource === 'upload' ? bankStatement ?? undefined : undefined,
        bankAccountId:
          bankStatementSource === 'ledger' ? selectedAccountId ?? undefined : undefined,
        baseCurrency,
      },
      {
        onSuccess: (data) => {
          reset();
          navigate(`/jobs/${data.job_id}`);
        },
      },
    );
  };

  function handleAccountSelect(accountId: string) {
    setSelectedAccountId(accountId || null);
    const account = accounts?.find((acc) => acc.id === accountId);
    if (account) setBaseCurrency(account.currency);
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">New reconciliation job</h1>
        <p className="mt-1 text-sm text-slate-600">
          Upload payment proofs and attach bank data — upload a statement file or select a
          registered bank account to reconcile against all pending ledger entries.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Payment proofs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <UploadDropzone
              testId="payment-proofs-dropzone"
              label="Drop payment proofs"
              multiple
              onFiles={addPaymentProofs}
              helperText="Multiple files supported. Images, PDFs, Excel and CSV are accepted."
            />
            <FileList
              files={paymentProofs}
              onRemove={removePaymentProof}
              emptyLabel="No payment proofs yet."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bank statement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="flex gap-1 rounded-lg bg-slate-100 p-1"
              role="radiogroup"
              aria-label="Bank statement source"
            >
              {SOURCE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={bankStatementSource === opt.value}
                  onClick={() => setBankStatementSource(opt.value)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    bankStatementSource === opt.value
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {bankStatementSource === 'upload' ? (
              <>
                <UploadDropzone
                  testId="bank-statement-dropzone"
                  label={bankStatement ? 'Replace bank statement' : 'Drop bank statement'}
                  onFiles={(files) => setBankStatement(files[0] ?? null)}
                  helperText="One XLSX, CSV, or PDF file with date, amount, reference, and counterparty columns."
                  acceptedExtensions={BANK_STATEMENT_EXTENSIONS}
                  acceptedMimeTypes={BANK_STATEMENT_MIME}
                />
                <FileList
                  files={bankStatement ? [bankStatement] : []}
                  onRemove={() => setBankStatement(null)}
                  emptyLabel="No bank statement uploaded."
                />
              </>
            ) : (
              <div className="space-y-4">
                {accountsLoading ? (
                  <p className="text-sm text-slate-500">Loading bank accounts…</p>
                ) : accounts?.length === 0 ? (
                  <p className="text-sm text-slate-600">
                    No bank accounts registered yet. Add an account and upload statements in{' '}
                    <span className="font-medium">Tenant mgmt</span> (port 5175), then return here.
                  </p>
                ) : (
                  <>
                    <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                      Bank account
                      <select
                        value={selectedAccountId ?? ''}
                        onChange={(e) => handleAccountSelect(e.target.value)}
                        aria-label="Bank account"
                        className="rounded border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
                      >
                        <option value="">Select an account…</option>
                        {accounts?.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} · {acc.bank_name} ({acc.currency})
                            {acc.uncleared_count > 0
                              ? ` — ${acc.uncleared_count} pending`
                              : ' — no pending entries'}
                          </option>
                        ))}
                      </select>
                    </label>

                    {selectedAccount && (
                      <>
                        <p className="text-sm text-slate-600">
                          ARIA will match payment proofs against{' '}
                          <span className="font-medium tabular-nums">
                            {selectedAccount.uncleared_count}
                          </span>{' '}
                          pending ledger{' '}
                          {selectedAccount.uncleared_count === 1 ? 'entry' : 'entries'} across{' '}
                          <span className="font-medium tabular-nums">
                            {selectedAccount.statement_count}
                          </span>{' '}
                          {selectedAccount.statement_count === 1 ? 'statement' : 'statements'}.
                        </p>

                        {selectedAccount.uncleared_count === 0 && (
                          <p className="text-sm text-amber-700" role="status">
                            All ledger entries for this account are already cleared. Upload a new
                            statement in Tenant mgmt or choose another account.
                          </p>
                        )}

                        <dl className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                          <div>
                            <span className="tabular-nums font-medium text-slate-900">
                              {selectedAccount.statement_count}
                            </span>{' '}
                            <span className="text-slate-600">
                              {selectedAccount.statement_count === 1 ? 'statement' : 'statements'}
                            </span>
                          </div>
                          <div>
                            <span
                              className={`tabular-nums font-medium ${
                                selectedAccount.uncleared_count > 0
                                  ? 'text-amber-700'
                                  : 'text-emerald-700'
                              }`}
                            >
                              {selectedAccount.uncleared_count}
                            </span>{' '}
                            <span className="text-slate-600">
                              pending{' '}
                              {selectedAccount.uncleared_count === 1 ? 'entry' : 'entries'}
                            </span>
                          </div>
                        </dl>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-3 text-sm">
            <span className="font-medium text-slate-700">Base currency</span>
            <select
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value)}
              aria-label="Base currency"
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-3">
            {createJob.isError ? (
              <p className="text-sm text-rose-600" role="alert">
                {createJob.error.message}
              </p>
            ) : null}
            <Button
              size="lg"
              onClick={onSubmit}
              disabled={!canSubmit}
              loading={createJob.isPending}
            >
              Start reconciliation
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
