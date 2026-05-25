import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TenantsPage } from '@/pages/TenantsPage';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth-store';
import { adminUserFixture } from '@/test/fixtures';

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', adminUserFixture);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('TenantsPage', () => {
  it('lists tenants from the API', async () => {
    renderWithProviders(<TenantsPage />);
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());
    expect(screen.getByText('Beta Ltd')).toBeInTheDocument();
  });

  it('creates a tenant and refreshes the list', async () => {
    renderWithProviders(<TenantsPage />);
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /onboard tenant/i }));
    await userEvent.type(screen.getByLabelText(/organisation name/i), 'Gamma Inc');
    await userEvent.click(screen.getByRole('button', { name: /create tenant/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /skip for now/i })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    await userEvent.click(screen.getByRole('button', { name: /^close$/i }));

    await waitFor(() => expect(screen.getByText('Gamma Inc')).toBeInTheDocument());
  });
});
