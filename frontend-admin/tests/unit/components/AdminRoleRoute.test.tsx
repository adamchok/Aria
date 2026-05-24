import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { AdminRoleRoute } from '@/components/AdminRoleRoute';
import { useAuthStore } from '@/stores/auth-store';
import { adminUserFixture, tenantUserFixture } from '@/test/fixtures';

describe('AdminRoleRoute', () => {
  it('renders children for admin users', () => {
    useAuthStore.getState().setAuth('token', adminUserFixture);
    render(
      <MemoryRouter>
        <AdminRoleRoute>
          <p>Admin content</p>
        </AdminRoleRoute>
      </MemoryRouter>,
    );
    expect(screen.getByText('Admin content')).toBeInTheDocument();
    useAuthStore.getState().clear();
  });

  it('blocks tenant users with sign-out action', async () => {
    useAuthStore.getState().setAuth('token', tenantUserFixture);
    render(
      <MemoryRouter>
        <AdminRoleRoute>
          <p>Admin content</p>
        </AdminRoleRoute>
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/platform admin access required/i);
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
