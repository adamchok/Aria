import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render';
import { LoginPage } from '@/pages/LoginPage';
import { useAuthStore } from '@/stores/auth-store';

function Harness() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<div data-testid="dashboard-page">dashboard</div>} />
    </Routes>
  );
}

beforeEach(() => {
  useAuthStore.getState().logout();
});

afterEach(() => {
  useAuthStore.getState().logout();
});

describe('LoginPage', () => {
  it('signs in with demo credentials and redirects to dashboard', async () => {
    renderWithProviders(<Harness />, { initialEntries: ['/login'] });

    await userEvent.type(screen.getByLabelText(/email/i), 'finance@novapay.demo');
    await userEvent.type(screen.getByLabelText(/password/i), 'novapay2026');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByTestId('dashboard-page')).toBeInTheDocument());
    expect(useAuthStore.getState().isLoggedIn).toBe(true);
  });

  it('shows error alert for wrong credentials', async () => {
    renderWithProviders(<Harness />, { initialEntries: ['/login'] });

    await userEvent.type(screen.getByLabelText(/email/i), 'wrong@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'badpassword');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/invalid/i));
    expect(useAuthStore.getState().isLoggedIn).toBe(false);
  });
});
