import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth-store';
import { tenantUserFixture } from '@/test/fixtures';

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', tenantUserFixture);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('AnalyticsPage', () => {
  it('renders KPI metrics from analytics API', async () => {
    renderWithProviders(<AnalyticsPage />);

    await waitFor(() => expect(screen.getByText('12')).toBeInTheDocument());
    expect(screen.getByText('220')).toBeInTheDocument();
    expect(screen.getByText('USD/MYR')).toBeInTheDocument();
  });
});
