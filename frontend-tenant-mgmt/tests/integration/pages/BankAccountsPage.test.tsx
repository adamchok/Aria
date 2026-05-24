import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BankAccountsPage } from '@/pages/BankAccountsPage';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth-store';
import { tenantUserFixture } from '@/test/fixtures';

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', tenantUserFixture);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('BankAccountsPage', () => {
  it('lists bank accounts', async () => {
    renderWithProviders(<BankAccountsPage />);
    await waitFor(() => expect(screen.getByText('Main Operating Account')).toBeInTheDocument());
    expect(screen.getByText(/Maybank/i)).toBeInTheDocument();
  });

  it('creates a bank account via modal', async () => {
    renderWithProviders(<BankAccountsPage />);
    await waitFor(() => expect(screen.getByText('Main Operating Account')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /add account/i }));
    await userEvent.type(screen.getByLabelText(/account name/i), 'USD Reserve');
    await userEvent.type(screen.getByLabelText(/bank name/i), 'CIMB');
    await userEvent.type(screen.getByLabelText(/account number/i), '****5678');
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /^add account$/i }));

    await waitFor(() => expect(screen.getByText('USD Reserve')).toBeInTheDocument());
  });
});
