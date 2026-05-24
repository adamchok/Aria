import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminQueuePage } from '@/pages/AdminQueuePage';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth-store';
import { adminUserFixture } from '@/test/fixtures';

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', adminUserFixture);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('AdminQueuePage', () => {
  it('shows buffered counts per tenant', async () => {
    renderWithProviders(<AdminQueuePage />);
    await waitFor(() => expect(screen.getByText(/system total/i)).toHaveTextContent('12'));
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('flushes a tenant queue on button click', async () => {
    renderWithProviders(<AdminQueuePage />);
    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /flush queue for acme corp/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /flush queue for acme corp/i })).toBeEnabled());
  });
});
