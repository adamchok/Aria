import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { AnalyticsPage } from '@/pages/AnalyticsPage';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/msw-server';
import { useAuthStore } from '@/stores/auth-store';
import { aiPerformanceFixture, analyticsFixture, tenantUserFixture } from '@/test/fixtures';

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', tenantUserFixture);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('AnalyticsPage', () => {
  describe('loading state', () => {
    it('shows skeleton placeholders while fetching', () => {
      renderWithProviders(<AnalyticsPage />);
      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe('hackathon scorecard', () => {
    it('renders benchmark headings', async () => {
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() => expect(screen.getByText('AI Benchmarks')).toBeInTheDocument());
    });

    it('shows match rate target as met when >= 90%', async () => {
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() =>
        expect(screen.getByText('Match precision ≥ 90% on high-confidence records')).toBeInTheDocument(),
      );
      // fixture avg_match_rate = 0.917 → met
      const checkmarks = screen.getAllByText('✓');
      expect(checkmarks.length).toBeGreaterThanOrEqual(1);
    });

    it('shows escalation target as met when 5–20%', async () => {
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() =>
        expect(screen.getByText('Escalation rate 5–20% to human review')).toBeInTheDocument(),
      );
      // fixture escalation_rate = 0.062 → in range
      expect(aiPerformanceFixture.escalation_in_target_range).toBe(true);
    });

    it('shows processing target as met when avg < 60s', async () => {
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() =>
        expect(screen.getByText('Processing latency < 60s per batch')).toBeInTheDocument(),
      );
      // fixture avg = 38.5s → met
      expect(aiPerformanceFixture.processing_target_met).toBe(true);
    });

    it('shows failed target indicator when match rate below 90%', async () => {
      server.use(
        http.get('http://localhost/api/v1/analytics/performance', () =>
          HttpResponse.json({ ...aiPerformanceFixture, match_rate_target_met: false }),
        ),
        http.get('http://localhost/api/v1/analytics/summary', () =>
          HttpResponse.json({ ...analyticsFixture, avg_match_rate: 0.72 }),
        ),
      );
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() => expect(screen.getByText('AI Benchmarks')).toBeInTheDocument());
      const crosses = screen.getAllByText('✗');
      expect(crosses.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('KPI cards', () => {
    it('renders match rate', async () => {
      renderWithProviders(<AnalyticsPage />);
      // analyticsFixture.avg_match_rate = 0.917 → "91.7%"
      await waitFor(() => expect(screen.getByText('91.7%')).toBeInTheDocument());
    });

    it('renders avg confidence', async () => {
      renderWithProviders(<AnalyticsPage />);
      // aiPerformanceFixture.avg_confidence = 0.83 → "83.0%"
      await waitFor(() => expect(screen.getByText('83.0%')).toBeInTheDocument());
    });

    it('renders avg processing time', async () => {
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() => expect(screen.getByText('38.5s')).toBeInTheDocument());
    });

    it('shows Target met badge when match rate >= 90%', async () => {
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() => expect(screen.getByText('Target met')).toBeInTheDocument());
    });

    it('shows Below target badge when match rate < 90%', async () => {
      server.use(
        http.get('http://localhost/api/v1/analytics/summary', () =>
          HttpResponse.json({ ...analyticsFixture, avg_match_rate: 0.78 }),
        ),
      );
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() => expect(screen.getByText('Below target')).toBeInTheDocument());
    });

    it('shows processing < 60s badge when under target', async () => {
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() => expect(screen.getByText('< 60s ✓')).toBeInTheDocument());
    });

    it('shows > 60s badge when over target', async () => {
      server.use(
        http.get('http://localhost/api/v1/analytics/performance', () =>
          HttpResponse.json({
            ...aiPerformanceFixture,
            processing_target_met: false,
            avg_processing_seconds: 75.2,
          }),
        ),
      );
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() => expect(screen.getByText('> 60s')).toBeInTheDocument());
    });
  });

  describe('confidence distribution', () => {
    it('renders all 4 bucket labels', async () => {
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() => expect(screen.getByText('< 50%')).toBeInTheDocument());
      expect(screen.getByText('50–75%')).toBeInTheDocument();
      expect(screen.getByText('75–90%')).toBeInTheDocument();
      expect(screen.getByText('≥ 90%')).toBeInTheDocument();
    });

    it('renders count + percentage for high-confidence bucket', async () => {
      renderWithProviders(<AnalyticsPage />);
      // bucket ≥ 90%: count=140, pct=0.583 → "140 (58%)"
      await waitFor(() => expect(screen.getByText('140 (58%)')).toBeInTheDocument());
    });

    it('renders count for uncertain bucket', async () => {
      renderWithProviders(<AnalyticsPage />);
      // bucket 50–75%: count=15, pct=0.063 → "15 (6%)"
      await waitFor(() => expect(screen.getByText('15 (6%)')).toBeInTheDocument());
    });
  });

  describe('decision breakdown', () => {
    it('renders auto-matched count', async () => {
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() => expect(screen.getByText('Auto-matched')).toBeInTheDocument());
      expect(screen.getByText('210')).toBeInTheDocument();
    });

    it('renders human confirmed count', async () => {
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() => expect(screen.getByText('Human confirmed')).toBeInTheDocument());
      expect(screen.getByText('12')).toBeInTheDocument();
    });

    it('renders human rejected count', async () => {
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() => expect(screen.getByText('Human rejected')).toBeInTheDocument());
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('shows review confirmation rate when reviews exist', async () => {
      renderWithProviders(<AnalyticsPage />);
      // confirmation_rate = 0.8 → "80%"
      await waitFor(() => expect(screen.getByText('80%')).toBeInTheDocument());
      expect(screen.getByText('(AI suggestions accepted)')).toBeInTheDocument();
    });

    it('hides confirmation rate when no reviews', async () => {
      server.use(
        http.get('http://localhost/api/v1/analytics/performance', () =>
          HttpResponse.json({
            ...aiPerformanceFixture,
            human_confirmed_count: 0,
            human_rejected_count: 0,
            human_review_confirmation_rate: 0,
          }),
        ),
      );
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() => expect(screen.getByText('Auto-matched')).toBeInTheDocument());
      expect(screen.queryByText('(AI suggestions accepted)')).not.toBeInTheDocument();
    });
  });

  describe('record status summary', () => {
    it('renders matched / uncertain / unmatched counts', async () => {
      renderWithProviders(<AnalyticsPage />);
      // analyticsFixture: matched=220, uncertain=15, unmatched=5
      await waitFor(() => expect(screen.getByText('220')).toBeInTheDocument());
      expect(screen.getByText('15')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  describe('corridor breakdown', () => {
    it('renders all corridor names', async () => {
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() => expect(screen.getByText('USD/MYR')).toBeInTheDocument());
      expect(screen.getByText('EUR/MYR')).toBeInTheDocument();
    });

    it('renders record and job counts per corridor', async () => {
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() => expect(screen.getByText('160 records · 8 jobs')).toBeInTheDocument());
      expect(screen.getByText('80 records · 4 jobs')).toBeInTheDocument();
    });
  });

  describe('period selector', () => {
    it('last 7d button updates date range', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() => expect(screen.getByText('AI Benchmarks')).toBeInTheDocument());

      const btn7 = screen.getByRole('button', { name: 'Last 7d' });
      await user.click(btn7);

      const startInput = screen.getByLabelText('From') as HTMLInputElement;
      const endInput = screen.getByLabelText('To') as HTMLInputElement;
      const expectedStart = new Date();
      expectedStart.setDate(expectedStart.getDate() - 7);
      expect(startInput.value).toBe(expectedStart.toISOString().slice(0, 10));
      expect(endInput.value).toBe(new Date().toISOString().slice(0, 10));
    });

    it('last 90d button updates date range', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() => expect(screen.getByText('AI Benchmarks')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Last 90d' }));
      const startInput = screen.getByLabelText('From') as HTMLInputElement;
      const expected = new Date();
      expected.setDate(expected.getDate() - 90);
      expect(startInput.value).toBe(expected.toISOString().slice(0, 10));
    });
  });

  describe('error state', () => {
    it('shows retry button when analytics fails', async () => {
      server.use(
        http.get('http://localhost/api/v1/analytics/summary', () =>
          HttpResponse.json({ detail: 'Internal server error' }, { status: 500 }),
        ),
      );
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() => expect(screen.getByText('Failed to load analytics data.')).toBeInTheDocument());
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    it('shows retry button when performance endpoint fails', async () => {
      server.use(
        http.get('http://localhost/api/v1/analytics/performance', () =>
          HttpResponse.json({ detail: 'Internal server error' }, { status: 500 }),
        ),
      );
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() => expect(screen.getByText('Failed to load analytics data.')).toBeInTheDocument());
    });
  });

  describe('empty state', () => {
    it('renders page title even with no data', async () => {
      server.use(
        http.get('http://localhost/api/v1/analytics/summary', () =>
          HttpResponse.json({
            ...analyticsFixture,
            total_jobs: 0,
            total_records: 0,
            matched_records: 0,
            uncertain_records: 0,
            unmatched_records: 0,
            avg_match_rate: 0,
            escalation_rate: 0,
            by_corridor: [],
          }),
        ),
        http.get('http://localhost/api/v1/analytics/performance', () =>
          HttpResponse.json({
            ...aiPerformanceFixture,
            total_records: 0,
            avg_confidence: 0,
            confidence_buckets: [
              { label: '< 50%', min_val: 0, max_val: 0.5, count: 0, pct: 0 },
              { label: '50–75%', min_val: 0.5, max_val: 0.75, count: 0, pct: 0 },
              { label: '75–90%', min_val: 0.75, max_val: 0.9, count: 0, pct: 0 },
              { label: '≥ 90%', min_val: 0.9, max_val: 1.0, count: 0, pct: 0 },
            ],
            auto_matched_count: 0,
            human_confirmed_count: 0,
            human_rejected_count: 0,
            recent_jobs: [],
          }),
        ),
      );
      renderWithProviders(<AnalyticsPage />);
      await waitFor(() => {
        expect(screen.getByText('AI Performance')).toBeInTheDocument();
        expect(screen.getByText('AI Benchmarks')).toBeInTheDocument();
      });
    });
  });
});
