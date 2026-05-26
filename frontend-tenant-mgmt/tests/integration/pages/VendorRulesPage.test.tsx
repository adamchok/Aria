import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { VendorRulesPage } from '@/pages/VendorRulesPage';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/msw-server';
import { useAuthStore } from '@/stores/auth-store';
import { tenantUserFixture } from '@/test/fixtures';

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', tenantUserFixture);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('VendorRulesPage', () => {
  it('lists vendor rules', async () => {
    renderWithProviders(<VendorRulesPage />);
    await waitFor(() => expect(screen.getByText('moonshot ai')).toBeInTheDocument());
    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByText('SGD')).toBeInTheDocument();
    expect(screen.getByText('Confirmed via review queue')).toBeInTheDocument();
  });

  it('shows field badge with field name', async () => {
    renderWithProviders(<VendorRulesPage />);
    await waitFor(() => expect(screen.getByText('currency')).toBeInTheDocument());
  });

  it('opens edit modal when Edit clicked', async () => {
    renderWithProviders(<VendorRulesPage />);
    await waitFor(() => expect(screen.getByText('moonshot ai')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /edit rule for moonshot ai/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Corrected value')).toHaveValue('USD');
    expect(screen.getByLabelText('Source note')).toHaveValue('Confirmed via review queue');
  });

  it('saves updated corrected value', async () => {
    renderWithProviders(<VendorRulesPage />);
    await waitFor(() => expect(screen.getByText('moonshot ai')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /edit rule for moonshot ai/i }));

    const input = screen.getByLabelText('Corrected value');
    await userEvent.clear(input);
    await userEvent.type(input, 'EUR');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => expect(screen.queryByLabelText('Corrected value')).not.toBeInTheDocument());
  });

  it('cancels edit without saving', async () => {
    renderWithProviders(<VendorRulesPage />);
    await waitFor(() => expect(screen.getByText('moonshot ai')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /edit rule for moonshot ai/i }));
    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(screen.queryByLabelText('Corrected value')).not.toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
  });

  it('opens confirm dialog when Delete clicked', async () => {
    renderWithProviders(<VendorRulesPage />);
    await waitFor(() => expect(screen.getByText('moonshot ai')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/delete feedback rule/i)).toBeInTheDocument();
  });

  it('deletes rule after confirming in dialog', async () => {
    renderWithProviders(<VendorRulesPage />);
    await waitFor(() => expect(screen.getByText('moonshot ai')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    await userEvent.click(screen.getByRole('button', { name: /delete rule/i }));

    await waitFor(() => expect(screen.queryByText('moonshot ai')).not.toBeInTheDocument());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dismisses dialog without deleting when Cancel clicked', async () => {
    renderWithProviders(<VendorRulesPage />);
    await waitFor(() => expect(screen.getByText('moonshot ai')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('moonshot ai')).toBeInTheDocument();
  });

  it('shows empty state when no rules exist', async () => {
    server.use(
      http.get('http://localhost/api/v1/vendor-rules', () => HttpResponse.json([])),
    );
    renderWithProviders(<VendorRulesPage />);
    await waitFor(() =>
      expect(screen.getByText(/no rules yet/i)).toBeInTheDocument(),
    );
  });
});
