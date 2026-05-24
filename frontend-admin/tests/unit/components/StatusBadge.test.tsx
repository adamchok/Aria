import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '@/components/StatusBadge';

describe('StatusBadge', () => {
  it.each([
    ['MATCHED', 'Matched', /emerald/],
    ['UNCERTAIN', 'Needs review', /amber/],
    ['UNMATCHED', 'Unmatched', /rose/],
  ] as const)('renders %s', (status, label, palette) => {
    render(<StatusBadge status={status} />);
    const el = screen.getByRole('status', { name: new RegExp(label, 'i') });
    expect(el).toHaveTextContent(label);
    expect(el.className).toMatch(palette);
  });
});
