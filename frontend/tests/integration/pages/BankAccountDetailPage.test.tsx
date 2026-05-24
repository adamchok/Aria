import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';

import { renderWithProviders } from '@/test/render';
import { server } from '@/test/msw-server';
import { BankAccountDetailPage } from '@/pages/BankAccountDetailPage';
import { ACCOUNT_ID, bankAccountFixture, ledgerEntryFixture } from '@/test/fixtures';

function Harness() {
  return (
    <Routes>
      <Route path="/bank-accounts/:accountId" element={<BankAccountDetailPage />} />
    </Routes>
  );
}

describe('BankAccountDetailPage', () => {
  const route = `/bank-accounts/${ACCOUNT_ID}`;

  it('renders account header with name and stats', async () => {
    renderWithProviders(<Harness />, { initialEntries: [route] });

    expect(await screen.findByRole('heading', { level: 1, name: bankAccountFixture.name })).toBeInTheDocument();
    expect(screen.getByText(bankAccountFixture.bank_name, { exact: false })).toBeInTheDocument();
    expect(screen.getAllByText(String(bankAccountFixture.uncleared_count))[0]).toBeInTheDocument();
  });

  it('ledger tab shows entries with pending status badge', async () => {
    renderWithProviders(<Harness />, { initialEntries: [route] });

    expect(await screen.findByText(ledgerEntryFixture.description)).toBeInTheDocument();
    expect(screen.getAllByText('Pending')[0]).toBeInTheDocument();
  });

  it('expands entry row on click to show details', async () => {
    renderWithProviders(<Harness />, { initialEntries: [route] });
    await screen.findByText(ledgerEntryFixture.description);

    const row = screen.getByText(ledgerEntryFixture.description).closest('tr')!;
    await userEvent.click(row);

    expect(await screen.findByText('Statement')).toBeInTheDocument();
    expect(screen.getByText(ledgerEntryFixture.statement_filename)).toBeInTheDocument();
  });

  it('shows cleared entries with correct badge', async () => {
    server.use(
      http.get(`http://localhost/api/v1/bank-accounts/${ACCOUNT_ID}/ledger`, () =>
        HttpResponse.json({
          items: [{ ...ledgerEntryFixture, cleared: true, cleared_by_job_id: null }],
          total: 1, page: 1, page_size: 50,
        }),
      ),
    );
    renderWithProviders(<Harness />, { initialEntries: [route] });
    expect(await screen.findAllByText('Cleared')).toBeTruthy();
  });

  it('opens upload statement modal', async () => {
    renderWithProviders(<Harness />, { initialEntries: [route] });
    await screen.findByRole('heading', { level: 1, name: bankAccountFixture.name });
    await userEvent.click(screen.getByRole('button', { name: /Upload statement/i }));
    expect(await screen.findByRole('dialog', { name: /Upload bank statement/i })).toBeInTheDocument();
  });

  it('switches to statements tab and shows statement rows', async () => {
    renderWithProviders(<Harness />, { initialEntries: [route] });
    await screen.findByRole('heading', { level: 1, name: bankAccountFixture.name });
    await userEvent.click(screen.getByRole('button', { name: /statements/i }));
    expect(await screen.findByText('may_2026.csv')).toBeInTheDocument();
  });

  it('shows delete confirmation dialog and navigates away on confirm', async () => {
    server.use(
      http.delete(`http://localhost/api/v1/bank-accounts/${ACCOUNT_ID}`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );
    renderWithProviders(<Harness />, { initialEntries: [route] });
    await screen.findByRole('heading', { level: 1, name: bankAccountFixture.name });
    await userEvent.click(screen.getAllByRole('button', { name: /Delete/i })[0]);
    expect(await screen.findByText(/Delete account\?/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Delete account/i }));
    await waitFor(() => expect(screen.queryByText(/Delete account\?/i)).not.toBeInTheDocument());
  });

  it('shows not found state on 404', async () => {
    server.use(
      http.get(`http://localhost/api/v1/bank-accounts/${ACCOUNT_ID}`, () =>
        HttpResponse.json({ detail: 'Not found' }, { status: 404 }),
      ),
    );
    renderWithProviders(<Harness />, { initialEntries: [route] });
    expect(await screen.findByText(/Bank account not found/i)).toBeInTheDocument();
  });
});
