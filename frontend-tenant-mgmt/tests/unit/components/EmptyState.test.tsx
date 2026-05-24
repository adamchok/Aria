import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@testing-library/react';
import { EmptyState } from '@/components/ui/EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="No users yet" description="Invite a user above." />);
    expect(screen.getByText('No users yet')).toBeInTheDocument();
    expect(screen.getByText('Invite a user above.')).toBeInTheDocument();
  });
});
