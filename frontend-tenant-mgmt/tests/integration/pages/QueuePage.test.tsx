import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueuePage } from '@/pages/QueuePage';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth-store';
import { tenantUserFixture } from '@/test/fixtures';

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', tenantUserFixture);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('QueuePage', () => {
  it('shows buffered transactions by corridor', async () => {
    renderWithProviders(<QueuePage />);

    await waitFor(() => expect(screen.getByText('USD/MYR')).toBeInTheDocument());
    expect(screen.getByText('EUR/MYR')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /flush queue now/i })).toBeEnabled();
  });

  it('flushes the queue on demand', async () => {
    renderWithProviders(<QueuePage />);
    await waitFor(() => expect(screen.getByText('USD/MYR')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /flush queue now/i }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/batch job queued successfully/i),
    );
  });
});
