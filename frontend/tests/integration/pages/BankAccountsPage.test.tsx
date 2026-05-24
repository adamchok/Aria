import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import { renderWithProviders } from '@/test/render';
import { server } from '@/test/msw-server';
import { BankAccountsPage } from '@/pages/BankAccountsPage';
import { bankAccountFixture } from '@/test/fixtures';

describe('BankAccountsPage', () => {
  it('renders account cards with stats', async () => {
    renderWithProviders(<BankAccountsPage />);

    expect(await screen.findByText(bankAccountFixture.name)).toBeInTheDocument();
    expect(screen.getByText(bankAccountFixture.bank_name, { exact: false })).toBeInTheDocument();
    expect(screen.getByText(bankAccountFixture.currency)).toBeInTheDocument();
    expect(screen.getByText('Statements')).toBeInTheDocument();
  });

  it('shows empty state when no accounts', async () => {
    server.use(
      http.get('http://localhost/api/v1/bank-accounts', () => HttpResponse.json([])),
    );
    renderWithProviders(<BankAccountsPage />);
    expect(await screen.findByText(/No bank accounts yet/i)).toBeInTheDocument();
  });

  it('opens create modal on Add account button click', async () => {
    renderWithProviders(<BankAccountsPage />);
    await screen.findByText(bankAccountFixture.name);
    await userEvent.click(screen.getByRole('button', { name: /Add account/i }));
    expect(await screen.findByRole('dialog', { name: /Add bank account/i })).toBeInTheDocument();
  });

  it('create modal submits and dismisses on success', async () => {
    renderWithProviders(<BankAccountsPage />);
    await screen.findByText(bankAccountFixture.name);
    await userEvent.click(screen.getAllByRole('button', { name: /Add account/i })[0]);

    const dialog = await screen.findByRole('dialog', { name: /Add bank account/i });
    await userEvent.type(dialog.querySelector('input[placeholder="Main Operating Account"]')!, 'Test Account');
    await userEvent.type(dialog.querySelector('input[placeholder="Maybank"]')!, 'CIMB');
    await userEvent.type(dialog.querySelector('input[placeholder="****1234"]')!, '****5678');

    await userEvent.click(within(dialog).getByRole('button', { name: /Add account/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows error message when create fails', async () => {
    server.use(
      http.post('http://localhost/api/v1/bank-accounts', () =>
        HttpResponse.json({ detail: 'Invalid currency' }, { status: 422 }),
      ),
    );
    renderWithProviders(<BankAccountsPage />);
    await screen.findByText(bankAccountFixture.name);
    await userEvent.click(screen.getAllByRole('button', { name: /Add account/i })[0]);

    const dialog = await screen.findByRole('dialog');
    await userEvent.type(dialog.querySelector('input[placeholder="Main Operating Account"]')!, 'Test');
    await userEvent.type(dialog.querySelector('input[placeholder="Maybank"]')!, 'Bank');
    await userEvent.type(dialog.querySelector('input[placeholder="****1234"]')!, '****0000');
    await userEvent.click(within(dialog).getByRole('button', { name: /Add account/i }));

    expect(await screen.findByText(/Invalid currency/i)).toBeInTheDocument();
  });
});
