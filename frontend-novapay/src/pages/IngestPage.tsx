import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { UploadDropzone } from '@/components/UploadDropzone';
import { FileList } from '@/components/FileList';
import type { TransactionIngestItem, UUID } from '@/types/api';

const CORRIDORS = ['USD/MYR', 'EUR/MYR', 'GBP/MYR', 'SGD/MYR'] as const;
type Corridor = (typeof CORRIDORS)[number] | '';

const BANK_STATEMENT_EXTENSIONS = ['.xlsx', '.csv', '.pdf'] as const;
const BANK_STATEMENT_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
  'application/pdf',
]);

type BankStatementSource = 'upload' | 'ledger';

const SOURCE_OPTIONS: { value: BankStatementSource; label: string }[] = [
  { value: 'upload', label: 'Upload file' },
  { value: 'ledger', label: 'From bank account' },
];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function IngestPage() {
  const qc = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [corridor, setCorridor] = useState<Corridor>('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [bankStatementSource, setBankStatementSource] = useState<BankStatementSource>('upload');
  const [selectedAccountId, setSelectedAccountId] = useState<UUID | null>(null);
  const [bankStatement, setBankStatement] = useState<File | null>(null);
  const [statementMessage, setStatementMessage] = useState<string | null>(null);

  const { data: accounts, isLoading: accountsLoading } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => api.listBankAccounts(),
  });

  const selectedAccount = accounts?.find((acc) => acc.id === selectedAccountId);

  const uploadStatementMutation = useMutation({
    mutationFn: () => api.uploadAccountStatement(selectedAccountId!, bankStatement!),
    onMutate: () => setStatementMessage(null),
    onSuccess: (data) => {
      setStatementMessage(
        `Uploaded ${data.entry_count} ledger ${data.entry_count === 1 ? 'entry' : 'entries'} from ${data.filename}.`,
      );
      setBankStatement(null);
      void qc.invalidateQueries({ queryKey: ['bank-accounts'] });
    },
  });

  const ingestMutation = useMutation({
    mutationFn: async () => {
      const transactions: TransactionIngestItem[] = await Promise.all(
        files.map(async (file) => ({
          payment_proof_b64: await fileToBase64(file),
          corridor: corridor || null,
        })),
      );
      return api.ingestTransactions({ transactions });
    },
    onMutate: () => setSuccessMessage(null),
    onSuccess: (data) => {
      setSuccessMessage(
        `Buffered ${data.buffered} transaction${data.buffered === 1 ? '' : 's'}.`,
      );
      setFiles([]);
      void qc.invalidateQueries({ queryKey: ['ingest', 'queue'] });
    },
  });

  const canSubmit = files.length > 0 && !ingestMutation.isPending;
  const canUploadStatement =
    !!selectedAccountId && bankStatement !== null && !uploadStatementMutation.isPending;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Simulate ingest API</h1>
        <p className="mt-1 text-sm text-slate-500">
          Mimic an external ERP: upload bank statements for ledger data, push payment proofs via{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">POST /api/v1/ingest/transactions</code>,
          then flush the queue to create reconciliation jobs.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Bank statement</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              Batch jobs match proofs against uncleared ledger entries. Upload a new statement or
              use pending entries already on a registered account.
            </p>

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
                  onClick={() => {
                    setBankStatementSource(opt.value);
                    setStatementMessage(null);
                  }}
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
              accountsLoading ? (
                <p className="text-sm text-slate-500">Loading bank accounts…</p>
              ) : accounts?.length === 0 ? (
                <p className="text-sm text-slate-600">
                  No bank accounts yet.{' '}
                  <Link to="/bank-accounts" className="text-teal-600 underline hover:text-teal-800">
                    Add a bank account
                  </Link>{' '}
                  first.
                </p>
              ) : (
                <>
                  <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700">
                    Bank account
                    <select
                      value={selectedAccountId ?? ''}
                      onChange={(e) => {
                        setSelectedAccountId(e.target.value || null);
                        setStatementMessage(null);
                      }}
                      aria-label="Bank account"
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
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

                  <UploadDropzone
                    testId="ingest-bank-statement-dropzone"
                    label={bankStatement ? 'Replace bank statement' : 'Drop bank statement'}
                    onFiles={(uploaded) => setBankStatement(uploaded[0] ?? null)}
                    helperText="One XLSX, CSV, or PDF with date, amount, reference, and counterparty columns."
                    acceptedExtensions={BANK_STATEMENT_EXTENSIONS}
                    acceptedMimeTypes={BANK_STATEMENT_MIME}
                  />
                  <FileList
                    files={bankStatement ? [bankStatement] : []}
                    onRemove={() => setBankStatement(null)}
                    emptyLabel="No bank statement uploaded."
                  />

                  {uploadStatementMutation.isError && (
                    <p className="text-sm text-rose-600" role="alert">
                      Upload failed.{' '}
                      {uploadStatementMutation.error instanceof Error
                        ? uploadStatementMutation.error.message
                        : 'Unknown error.'}
                    </p>
                  )}

                  {statementMessage && (
                    <p className="text-sm font-medium text-emerald-700" role="status">
                      {statementMessage}
                    </p>
                  )}

                  <div>
                    <Button
                      variant="secondary"
                      onClick={() => uploadStatementMutation.mutate()}
                      disabled={!canUploadStatement}
                      loading={uploadStatementMutation.isPending}
                    >
                      Upload statement
                    </Button>
                  </div>
                </>
              )
            ) : accountsLoading ? (
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
                    onChange={(e) => {
                      setSelectedAccountId(e.target.value || null);
                      setStatementMessage(null);
                    }}
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
                      Buffered proofs will match against{' '}
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
                        statement or choose another account.
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
                          pending {selectedAccount.uncleared_count === 1 ? 'entry' : 'entries'}
                        </span>
                      </div>
                    </dl>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Payment proofs</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="corridor" className="text-sm font-medium text-slate-700">
                Corridor <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <select
                id="corridor"
                value={corridor}
                onChange={(e) => setCorridor(e.target.value as Corridor)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              >
                <option value="">Auto-detect from document</option>
                {CORRIDORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400">
                Used only for queue display. Currency and value date are always extracted from the document by ARIA.
              </p>
            </div>

            <p className="text-sm text-slate-600">
              Each file becomes one buffered transaction.
            </p>
            <UploadDropzone
              label="Drop payment proofs"
              multiple
              testId="ingest-proofs-dropzone"
              onFiles={(added) => setFiles((prev) => [...prev, ...added])}
              helperText="Each file becomes one buffered transaction. Images, PDFs, and Excel are accepted."
            />
            <FileList
              files={files}
              onRemove={(name) => setFiles((prev) => prev.filter((f) => f.name !== name))}
              emptyLabel="No payment proofs yet."
            />
          </CardContent>
        </Card>
      </div>

      {ingestMutation.isError && (
        <p className="text-sm text-rose-600" role="alert">
          Ingest failed.{' '}
          {ingestMutation.error instanceof Error ? ingestMutation.error.message : 'Unknown error.'}
        </p>
      )}

      {successMessage && (
        <p className="text-sm font-medium text-emerald-700" role="status">
          {successMessage}{' '}
          <Link to="/queue" className="underline hover:text-emerald-800">
            View queue
          </Link>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => ingestMutation.mutate()} disabled={!canSubmit}>
          {ingestMutation.isPending ? 'Pushing…' : 'Push to buffer'}
        </Button>
        <Link to="/queue" className="text-sm text-slate-600 underline hover:text-slate-900">
          Open transaction queue
        </Link>
      </div>
    </div>
  );
}
