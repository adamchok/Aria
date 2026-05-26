import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiKeysPage } from '@/pages/ApiKeysPage';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth-store';
import { tenantUserFixture } from '@/test/fixtures';

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', tenantUserFixture);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('ApiKeysPage', () => {
  it('lists existing API keys', async () => {
    renderWithProviders(<ApiKeysPage />);
    await waitFor(() => expect(screen.getByText('Production')).toBeInTheDocument());
  });

  it('generates a new key and shows it once', async () => {
    renderWithProviders(<ApiKeysPage />);
    await waitFor(() => expect(screen.getByText('Production')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText(/key label/i), 'Staging');
    await userEvent.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() =>
      expect(screen.getByText(/aria_live_test_key_shown_once_only/i)).toBeInTheDocument(),
    );
    expect(screen.getByText('Staging')).toBeInTheDocument();
  });

  it('opens confirm dialog when Revoke clicked', async () => {
    renderWithProviders(<ApiKeysPage />);
    await waitFor(() => expect(screen.getByText('Production')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /^revoke$/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/revoke api key/i)).toBeInTheDocument();
  });

  it('revokes key after confirming in dialog', async () => {
    renderWithProviders(<ApiKeysPage />);
    await waitFor(() => expect(screen.getByText('Production')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /^revoke$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^revoke key$/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Revoked')).toBeInTheDocument();
  });

  it('dismisses dialog without revoking when Cancel clicked', async () => {
    renderWithProviders(<ApiKeysPage />);
    await waitFor(() => expect(screen.getByText('Production')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /^revoke$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});
