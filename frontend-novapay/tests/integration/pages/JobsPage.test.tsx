import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JobsPage } from '@/pages/JobsPage';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth-store';

beforeEach(() => {
  useAuthStore.getState().login();
});

afterEach(() => {
  useAuthStore.getState().logout();
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

  it('opens a confirmation modal before deleting a job', async () => {
    renderWithProviders(<JobsPage />);
    await waitFor(() => expect(screen.getByText(/11111111/)).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /delete job/i }));

    expect(screen.getByRole('heading', { name: /delete job\?/i })).toBeInTheDocument();
    expect(screen.queryByText(/yes, delete/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^delete job$/i }));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /delete job\?/i })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.queryByText(/11111111/)).not.toBeInTheDocument());
  });
});
