import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render';
import { server } from '@/test/msw-server';
import { JobProgressPage } from '@/pages/JobProgressPage';
import { JOB_ID, jobStatusCompleted } from '@/test/fixtures';

function Harness() {
  return (
    <Routes>
      <Route path="/jobs/:jobId" element={<JobProgressPage />} />
      <Route path="/jobs/:jobId/results" element={<div data-testid="results-page" />} />
      <Route path="/jobs/:jobId/review" element={<div data-testid="review-page" />} />
    </Routes>
  );
}

describe('JobProgressPage', () => {
  it('shows progress and navigates to results when COMPLETED', async () => {
    renderWithProviders(<Harness />, { initialEntries: [`/jobs/${JOB_ID}`] });
    await waitFor(() => expect(screen.getByTestId('results-page')).toBeInTheDocument());
  });

  it('navigates to review when AWAITING_REVIEW', async () => {
    server.use(
      http.get(`http://localhost/api/v1/jobs/${JOB_ID}`, () =>
        HttpResponse.json({ ...jobStatusCompleted, status: 'AWAITING_REVIEW' }),
      ),
    );
    renderWithProviders(<Harness />, { initialEntries: [`/jobs/${JOB_ID}`] });
    await waitFor(() => expect(screen.getByTestId('review-page')).toBeInTheDocument());
  });

  it('renders an error and retry on failure', async () => {
    server.use(
      http.get(`http://localhost/api/v1/jobs/${JOB_ID}`, () =>
        HttpResponse.json({ detail: 'boom' }, { status: 500 }),
      ),
    );
    renderWithProviders(<Harness />, { initialEntries: [`/jobs/${JOB_ID}`] });
    expect(await screen.findByRole('alert')).toHaveTextContent(/boom/);
    expect(screen.getByRole('button', { name: /Retry/i })).toBeEnabled();
  });
});
