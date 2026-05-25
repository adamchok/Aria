import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { BankAccountDetailPage } from '@/pages/BankAccountDetailPage';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth-store';
import { ACCOUNT_ID, tenantUserFixture } from '@/test/fixtures';

function Harness() {
  return (
    <Routes>
      <Route path="/bank-accounts/:accountId" element={<BankAccountDetailPage />} />
    </Routes>
  );
}

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', tenantUserFixture);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('BankAccountDetailPage', () => {
  it('shows account details and ledger entries', async () => {
    renderWithProviders(<Harness />, { initialEntries: [`/bank-accounts/${ACCOUNT_ID}`] });

    await waitFor(() => expect(screen.getByRole('heading', { name: /main operating account/i })).toBeInTheDocument());
    expect(screen.getByText(/Payment from Acme/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit entry inv-001/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /statements/i }));
    await waitFor(() => expect(screen.getByText('may_2026.csv')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /delete statement may_2026.csv/i })).toBeInTheDocument();
  });

  it('opens edit modal for a pending ledger entry', async () => {
    renderWithProviders(<Harness />, { initialEntries: [`/bank-accounts/${ACCOUNT_ID}`] });
    await waitFor(() => expect(screen.getByRole('button', { name: /edit entry inv-001/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /edit entry inv-001/i }));
    expect(screen.getByRole('heading', { name: /edit ledger entry/i })).toBeInTheDocument();
  });

  it('uploads a bank statement via the dropzone modal', async () => {
    renderWithProviders(<Harness />, { initialEntries: [`/bank-accounts/${ACCOUNT_ID}`] });
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /main operating account/i })).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole('button', { name: /upload statement/i }));

    const stmtInput = screen.getByLabelText(/Drop bank statement file input/i) as HTMLInputElement;
    await userEvent.upload(stmtInput, new File(['stmt'], 'june.csv', { type: 'text/csv' }));
    await userEvent.click(screen.getByRole('button', { name: /^upload$/i }));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /upload bank statement/i })).not.toBeInTheDocument(),
    );
  });
});
