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
      <Route path="/tenants" element={<div data-testid="tenants-page">tenants</div>} />
    </Routes>
  );
}

beforeEach(() => {
  useAuthStore.getState().clear();
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('LoginPage', () => {
  it('shows validation-required fields and signs in on success', async () => {
    renderWithProviders(<Harness />, { initialEntries: ['/login'] });

    await userEvent.type(screen.getByLabelText(/email/i), 'admin@aria.local');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByTestId('tenants-page')).toBeInTheDocument());
    expect(useAuthStore.getState().accessToken).toBe('test-jwt-token');
  });

  it('surfaces invalid credentials', async () => {
    renderWithProviders(<Harness />, { initialEntries: ['/login'] });

    await userEvent.type(screen.getByLabelText(/email/i), 'bad@aria.local');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/invalid/i));
  });
});
