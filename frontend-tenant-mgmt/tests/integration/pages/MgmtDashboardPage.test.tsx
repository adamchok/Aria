import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { MgmtDashboardPage } from '@/pages/MgmtDashboardPage';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth-store';
import { tenantUserFixture } from '@/test/fixtures';

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', tenantUserFixture);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('MgmtDashboardPage', () => {
  it('shows analytics and queue summary metrics', async () => {
    renderWithProviders(<MgmtDashboardPage />);

    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Batch trigger').closest('div')?.parentElement).toHaveTextContent('count');
  });

  it('links to configuration pages', async () => {
    renderWithProviders(<MgmtDashboardPage />);

    await waitFor(() => expect(screen.getByRole('link', { name: /api keys/i })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /webhooks/i })).toHaveAttribute('href', '/webhooks');
    expect(screen.getByRole('link', { name: /bank accounts/i })).toHaveAttribute('href', '/bank-accounts');
  });
});
