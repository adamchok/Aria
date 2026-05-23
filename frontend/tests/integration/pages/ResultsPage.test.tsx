import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/render';
import { ResultsPage } from '@/pages/ResultsPage';
import { JOB_ID } from '@/test/fixtures';

function Harness() {
  return (
    <Routes>
      <Route path="/jobs/:jobId/results" element={<ResultsPage />} />
    </Routes>
  );
}

describe('ResultsPage', () => {
  it('renders summary, narrative, and export link', async () => {
    renderWithProviders(<Harness />, { initialEntries: [`/jobs/${JOB_ID}/results`] });
    expect(await screen.findByText(/Reconciliation results/i)).toBeInTheDocument();
    expect(screen.getByText(/ARIA reconciled 1 of 2 records/i)).toBeInTheDocument();
    const exportLink = screen.getByRole('link', { name: /Export Excel/i });
    expect(exportLink).toHaveAttribute('href', expect.stringMatching(/\/export$/));
    expect(screen.getByRole('link', { name: /Open review queue/i })).toHaveAttribute(
      'href',
      `/jobs/${JOB_ID}/review`,
    );
  });
});
