import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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

    await userEvent.type(screen.getByLabelText('Email'), 'newuser@acme.test');
    await userEvent.type(screen.getByLabelText('Password'), 'password123');
    await userEvent.selectOptions(screen.getByLabelText('Tenant'), TENANT_ID);
    await userEvent.click(screen.getByRole('button', { name: /create user/i }));

    await waitFor(() => expect(screen.getByText('newuser@acme.test')).toBeInTheDocument());
  });

  it('disables submit until password meets minimum length', async () => {
    renderWithProviders(<UsersPage />);
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('Email'), 'short@acme.test');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    expect(screen.getByRole('button', { name: /create user/i })).toBeDisabled();
  });
});
