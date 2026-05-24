import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JobsPage } from '@/pages/JobsPage';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth-store';
import { tenantUserFixture } from '@/test/fixtures';

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', tenantUserFixture);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('JobsPage', () => {
  it('lists jobs and links to upload', async () => {
    renderWithProviders(<JobsPage />);

    await waitFor(() => expect(screen.getByText(/11111111/)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /new job/i })).toHaveAttribute('href', '/upload');
  });

  it('filters jobs by status tab', async () => {
    renderWithProviders(<JobsPage />);
    await waitFor(() => expect(screen.getByText(/11111111/)).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /awaiting review/i }));
    await waitFor(() =>
      expect(screen.getByText(/no jobs match the current filter/i)).toBeInTheDocument(),
    );
  });
});
