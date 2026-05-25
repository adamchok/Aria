import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { ReviewDrawer } from '@/components/ReviewDrawer';
import { matchedItem, uncertainItem } from '@/test/fixtures';

describe('ReviewDrawer', () => {
  it('shows update match for auto-matched rows, not confirm/reject', () => {
    render(
      <ReviewDrawer
        match={matchedItem}
        baseCurrency="MYR"
        bankEntries={[matchedItem.bank_entry!]}
        onClose={vi.fn()}
        onAction={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: /Confirm match/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Reject/i })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^Update match$/i })).toBeInTheDocument();
  });

  it('shows confirm/reject and manual match for uncertain review items', async () => {
    render(
      <ReviewDrawer
        match={uncertainItem}
        baseCurrency="MYR"
        bankEntries={[uncertainItem.bank_entry!]}
        onClose={vi.fn()}
        onAction={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: /Confirm match/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Reject/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^Manual match$/i })).toBeInTheDocument();
  });
});
