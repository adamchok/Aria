import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { UploadDropzone } from '@/components/UploadDropzone';
import { FileList } from '@/components/FileList';
import { useUploadStore } from '@/stores/upload-store';
import { useCreateJob } from '@/hooks/useCreateJob';

const CURRENCIES = ['MYR', 'USD', 'EUR', 'GBP', 'SGD'];

const BANK_STATEMENT_EXTENSIONS = ['.xlsx', '.csv', '.pdf'] as const;
const BANK_STATEMENT_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
  'application/pdf',
]);

export function UploadPage() {
  const navigate = useNavigate();
  const {
    paymentProofs,
    bankStatement,
    baseCurrency,
    addPaymentProofs,
    removePaymentProof,
    setBankStatement,
    setBaseCurrency,
    reset,
  } = useUploadStore();
  const createJob = useCreateJob();

  const canSubmit = paymentProofs.length > 0 && bankStatement !== null && !createJob.isPending;

  const onSubmit = () => {
    if (!bankStatement) return;
    createJob.mutate(
      { paymentProofs, bankStatement, baseCurrency },
      {
        onSuccess: (data) => {
          reset();
          navigate(`/jobs/${data.job_id}`);
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">New reconciliation job</h1>
        <p className="mt-1 text-sm text-slate-600">
          Upload payment proofs and a bank statement. ARIA extracts, normalises, and matches
          transactions automatically — low-confidence items are routed to your review queue.
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
