import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SummaryCards } from '@/components/SummaryCards';
import { reportFixture } from '@/test/fixtures';

describe('SummaryCards', () => {
  it('renders counts and currency-formatted totals', () => {
    render(<SummaryCards summary={reportFixture.summary} baseCurrency="MYR" />);
    expect(screen.getByText('Total records')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('MYR 8,460.00')).toBeInTheDocument();
    expect(screen.getByText(/variance MYR -50\.76/)).toBeInTheDocument();
  });
});
