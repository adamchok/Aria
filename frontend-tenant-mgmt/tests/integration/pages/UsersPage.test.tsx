import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UsersPage } from '@/pages/UsersPage';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth-store';
import { tenantUserFixture } from '@/test/fixtures';

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', tenantUserFixture);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('UsersPage', () => {
  it('lists tenant users', async () => {
    renderWithProviders(<UsersPage />);
    await waitFor(() => expect(screen.getByText('finance@acme.test')).toBeInTheDocument());
  });

  it('creates a new tenant user', async () => {
    renderWithProviders(<UsersPage />);
    await waitFor(() => expect(screen.getByText('finance@acme.test')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/^email$/i), 'newuser@acme.test');
    await userEvent.type(screen.getByLabelText(/^password$/i), 'password123');
    await userEvent.click(screen.getByRole('button', { name: /create user/i }));

    await waitFor(() => expect(screen.getByText('newuser@acme.test')).toBeInTheDocument());
  });
});
