import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { DashboardPage } from '@/pages/DashboardPage';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth-store';
import { tenantUserFixture } from '@/test/fixtures';

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', tenantUserFixture);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('DashboardPage', () => {
  it('shows pipeline summary and recent jobs', async () => {
    renderWithProviders(<DashboardPage />);

    await waitFor(() => expect(screen.getByText('50%')).toBeInTheDocument());
    expect(screen.getByText(/11111111/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view all/i })).toHaveAttribute('href', '/jobs');
  });
});
