import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { TenantDetailPage } from '@/pages/TenantDetailPage';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth-store';
import { adminUserFixture, TENANT_ID } from '@/test/fixtures';

function Harness() {
  return (
    <Routes>
      <Route path="/tenants/:tenantId" element={<TenantDetailPage />} />
    </Routes>
  );
}

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', adminUserFixture);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('TenantDetailPage', () => {
  it('shows API keys and users for the tenant', async () => {
    renderWithProviders(<Harness />, { initialEntries: [`/tenants/${TENANT_ID}`] });
    await waitFor(() => expect(screen.getByText('Production')).toBeInTheDocument());
    expect(screen.getByText('finance@acme.test')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to tenants/i })).toBeInTheDocument();
  });
});
