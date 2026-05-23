import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';

import { renderWithProviders } from '@/test/render';
import { server } from '@/test/msw-server';
import { ReviewPage } from '@/pages/ReviewPage';
import { JOB_ID, uncertainItem } from '@/test/fixtures';

function Harness() {
  return (
    <Routes>
      <Route path="/jobs/:jobId/review" element={<ReviewPage />} />
    </Routes>
  );
}

describe('ReviewPage', () => {
  it('renders one card per uncertain item and confirms a match', async () => {
    renderWithProviders(<Harness />, { initialEntries: [`/jobs/${JOB_ID}/review`] });

    const item = await screen.findByText(uncertainItem.normalised_record.payment.payer);
    expect(item).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Review$/ }));
    const dialog = await screen.findByRole('dialog', { name: /Review match/i });
    await userEvent.click(within(dialog).getByRole('button', { name: /Confirm match/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows the empty state when the queue is empty', async () => {
    server.use(
      http.get(`http://localhost/api/v1/jobs/${JOB_ID}/review`, () => HttpResponse.json([])),
    );
    renderWithProviders(<Harness />, { initialEntries: [`/jobs/${JOB_ID}/review`] });
    expect(await screen.findByText(/No uncertain items/i)).toBeInTheDocument();
  });

  it('manual_match button is disabled until a bank entry id is entered', async () => {
    renderWithProviders(<Harness />, { initialEntries: [`/jobs/${JOB_ID}/review`] });
    await userEvent.click(await screen.findByRole('button', { name: /Review$/ }));
    const dialog = await screen.findByRole('dialog');
    const manualBtn = within(dialog).getByRole('button', { name: /Manual match/i });
    expect(manualBtn).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Manual bank entry id/i), 'bank-x');
    expect(manualBtn).toBeEnabled();
  });
});
