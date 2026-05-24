import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebhooksPage } from '@/pages/WebhooksPage';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth-store';
import { tenantUserFixture } from '@/test/fixtures';

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', tenantUserFixture);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('WebhooksPage', () => {
  it('lists registered webhooks', async () => {
    renderWithProviders(<WebhooksPage />);
    await waitFor(() => expect(screen.getByText('ERP')).toBeInTheDocument());
    expect(screen.getByText(/erp\.example\.com/i)).toBeInTheDocument();
  });

  it('registers a new webhook and shows signing secret', async () => {
    renderWithProviders(<WebhooksPage />);
    await waitFor(() => expect(screen.getByText('ERP')).toBeInTheDocument());

    await userEvent.type(
      screen.getByLabelText(/endpoint url/i),
      'https://hooks.example.com/aria',
    );
    await userEvent.click(screen.getByRole('button', { name: /register webhook/i }));

    await waitFor(() =>
      expect(screen.getByText(/whsec_test_secret_shown_once/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/hooks\.example\.com/i)).toBeInTheDocument();
  });
});
