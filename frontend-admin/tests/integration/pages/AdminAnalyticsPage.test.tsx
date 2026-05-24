import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { AdminAnalyticsPage } from '@/pages/AdminAnalyticsPage';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/stores/auth-store';
import { adminUserFixture } from '@/test/fixtures';

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', adminUserFixture);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('AdminAnalyticsPage', () => {
  it('renders platform summary cards', async () => {
    renderWithProviders(<AdminAnalyticsPage />);
    await waitFor(() => expect(screen.getByText('15')).toBeInTheDocument());
    expect(screen.getByText('93%')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });
});
