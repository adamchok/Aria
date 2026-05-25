import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UsersPage } from '@/pages/UsersPage';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth-store';
import { adminUserFixture, TENANT_ID } from '@/test/fixtures';

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', adminUserFixture);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('UsersPage', () => {
  it('lists users from the API', async () => {
    renderWithProviders(<UsersPage />);
    await waitFor(() => expect(screen.getByText('admin@aria.local')).toBeInTheDocument());
    expect(screen.getByText('finance@acme.test')).toBeInTheDocument();
  });

  it('creates a tenant user when form is valid', async () => {
    renderWithProviders(<UsersPage />);
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /add user/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/email address/i), 'newuser@acme.test');
    await userEvent.type(within(dialog).getByLabelText(/password/i), 'password123');
    await userEvent.selectOptions(within(dialog).getByLabelText(/^tenant$/i), TENANT_ID);
    await userEvent.click(within(dialog).getByRole('button', { name: /^create user$/i }));

    await waitFor(() => expect(screen.getByText('newuser@acme.test')).toBeInTheDocument());
  });

  it('disables submit until password meets minimum length', async () => {
    renderWithProviders(<UsersPage />);
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /add user/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/email address/i), 'short@acme.test');
    await userEvent.type(within(dialog).getByLabelText(/password/i), 'short');
    expect(within(dialog).getByRole('button', { name: /^create user$/i })).toBeDisabled();
  });
});
