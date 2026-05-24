import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { render } from '@testing-library/react';
import { TenantRoleRoute } from '@/components/TenantRoleRoute';
import { useAuthStore } from '@/stores/auth-store';
import { adminUserFixture, tenantUserFixture } from '@/test/fixtures';

describe('TenantRoleRoute', () => {
  it('renders children for tenant users', () => {
    useAuthStore.getState().setAuth('token', tenantUserFixture);
    render(
      <MemoryRouter>
        <TenantRoleRoute>
          <p>Ops content</p>
        </TenantRoleRoute>
      </MemoryRouter>,
    );
    expect(screen.getByText('Ops content')).toBeInTheDocument();
    useAuthStore.getState().clear();
  });

  it('blocks admin users with sign-out action', async () => {
    useAuthStore.getState().setAuth('token', adminUserFixture);
    render(
      <MemoryRouter>
        <TenantRoleRoute>
          <p>Ops content</p>
        </TenantRoleRoute>
      </MemoryRouter>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/tenant user access required/i);
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
