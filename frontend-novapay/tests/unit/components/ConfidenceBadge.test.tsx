import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfidenceBadge } from '@/components/ConfidenceBadge';

describe('ConfidenceBadge', () => {
  it('shows the percent and "High confidence" at 0.82', () => {
    render(<ConfidenceBadge confidence={0.82} />);
    const el = screen.getByLabelText(/Confidence 82% — High confidence/i);
    expect(el).toBeInTheDocument();
    expect(el).toHaveTextContent('82%');
  });

  it('uses the amber palette for 0.62 (needs review)', () => {
    render(<ConfidenceBadge confidence={0.62} />);
    const el = screen.getByLabelText(/Confidence 62% — Needs review/i);
    expect(el.className).toMatch(/amber/);
  });

  it('uses the rose palette below the review floor', () => {
    render(<ConfidenceBadge confidence={0.3} />);
    const el = screen.getByLabelText(/Low confidence/i);
    expect(el.className).toMatch(/rose/);
  });
});
