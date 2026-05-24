import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@testing-library/react';
import { EmptyState } from '@/components/ui/EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="No tenants yet" description="Create one above." />);
    expect(screen.getByText('No tenants yet')).toBeInTheDocument();
    expect(screen.getByText('Create one above.')).toBeInTheDocument();
  });
});
