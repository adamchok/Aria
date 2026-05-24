import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@testing-library/react';
import { EmptyState } from '@/components/ui/EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="No uncertain items" description="All matches exceeded the confidence threshold." />);
    expect(screen.getByText('No uncertain items')).toBeInTheDocument();
    expect(screen.getByText(/confidence threshold/i)).toBeInTheDocument();
  });
});
