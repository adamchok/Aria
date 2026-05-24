import { describe, expect, it, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render';
import { UploadPage } from '@/pages/UploadPage';
import { useUploadStore } from '@/stores/upload-store';
import { ACCOUNT_ID } from '@/test/fixtures';

function Harness() {
  return (
    <Routes>
      <Route path="/upload" element={<UploadPage />} />
      <Route path="/jobs/:jobId" element={<div data-testid="progress-page">progress</div>} />
    </Routes>
  );
}

beforeEach(() => {
  useUploadStore.getState().reset();
});

describe('UploadPage', () => {
  it('disables submit until both a payment proof and a bank statement are present', async () => {
    renderWithProviders(<Harness />, { initialEntries: ['/upload'] });
    const submit = screen.getByRole('button', { name: /Start reconciliation/i });
    expect(submit).toBeDisabled();

    const proofInput = screen.getByLabelText(/Drop payment proofs file input/i) as HTMLInputElement;
    await userEvent.upload(proofInput, new File(['p'], 'usd.png', { type: 'image/png' }));
    expect(submit).toBeDisabled();

    const stmtInput = screen.getByLabelText(/Drop bank statement file input/i) as HTMLInputElement;
    await userEvent.upload(stmtInput, new File(['s'], 'may.csv', { type: 'text/csv' }));
    expect(submit).toBeEnabled();
  });

  it('navigates to the job progress page on successful create', async () => {
    renderWithProviders(<Harness />, { initialEntries: ['/upload'] });
    const proofInput = screen.getByLabelText(/Drop payment proofs file input/i) as HTMLInputElement;
    const stmtInput = screen.getByLabelText(/Drop bank statement file input/i) as HTMLInputElement;
    await userEvent.upload(proofInput, new File(['p'], 'usd.png', { type: 'image/png' }));
    await userEvent.upload(stmtInput, new File(['s'], 'may.csv', { type: 'text/csv' }));
    await userEvent.click(screen.getByRole('button', { name: /Start reconciliation/i }));

    await waitFor(() => expect(screen.getByTestId('progress-page')).toBeInTheDocument());
  });

  it('allows selecting a bank account to use all pending ledger entries', async () => {
    renderWithProviders(<Harness />, { initialEntries: ['/upload'] });

    await userEvent.click(screen.getByRole('radio', { name: /From bank account/i }));

    const proofInput = screen.getByLabelText(/Drop payment proofs file input/i) as HTMLInputElement;
    await userEvent.upload(proofInput, new File(['p'], 'usd.png', { type: 'image/png' }));

    const submit = screen.getByRole('button', { name: /Start reconciliation/i });
    expect(submit).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText('Bank account'), ACCOUNT_ID);

    expect(
      screen.getByText(/pending ledger entries across/i),
    ).toBeInTheDocument();
    expect(submit).toBeEnabled();

    await userEvent.click(submit);
    await waitFor(() => expect(screen.getByTestId('progress-page')).toBeInTheDocument());
  });
});
