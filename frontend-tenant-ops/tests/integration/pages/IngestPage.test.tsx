import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IngestPage } from '@/pages/IngestPage';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth-store';
import { tenantUserFixture } from '@/test/fixtures';

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', tenantUserFixture);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('IngestPage', () => {
  it('renders simulate ingest form', () => {
    renderWithProviders(<IngestPage />);
    expect(screen.getByRole('heading', { name: /simulate ingest api/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /push to buffer/i })).toBeDisabled();
  });

  it('pushes files to the ingest buffer', async () => {
    renderWithProviders(<IngestPage />);

    const proofInput = screen.getByLabelText(/Drop payment proofs file input/i) as HTMLInputElement;
    const file = new File(['proof'], 'invoice.png', { type: 'image/png' });
    await userEvent.upload(proofInput, file);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /push to buffer/i })).toBeEnabled(),
    );

    await userEvent.click(screen.getByRole('button', { name: /push to buffer/i }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/buffered 1 transaction/i),
    );
  });

  it('uploads a bank statement via drag-and-drop target', async () => {
    renderWithProviders(<IngestPage />);

    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Main Operating Account/i })).toBeInTheDocument(),
    );
    await userEvent.selectOptions(screen.getByLabelText('Bank account'), [
      screen.getByRole('option', { name: /Main Operating Account/i }),
    ]);

    const stmtInput = screen.getByLabelText(/Drop bank statement file input/i) as HTMLInputElement;
    await userEvent.upload(stmtInput, new File(['stmt'], 'may.csv', { type: 'text/csv' }));

    await userEvent.click(screen.getByRole('button', { name: /upload statement/i }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/uploaded 2 ledger entries/i),
    );
  });
});
