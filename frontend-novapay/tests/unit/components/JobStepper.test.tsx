import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobStepper } from '@/components/JobStepper';

describe('JobStepper', () => {
  it('marks ingestion active during INGESTING', () => {
    render(<JobStepper status="INGESTING" agentsCompleted={[]} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveAttribute('data-state', 'active');
    expect(items[1]).toHaveAttribute('data-state', 'pending');
  });

  it('marks ingestion complete and matching active when matching', () => {
    render(<JobStepper status="MATCHING" agentsCompleted={['ingestion', 'normalisation']} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveAttribute('data-state', 'complete');
    expect(items[1]).toHaveAttribute('data-state', 'complete');
    expect(items[2]).toHaveAttribute('data-state', 'active');
    expect(items[3]).toHaveAttribute('data-state', 'pending');
  });

  it('marks all complete when the job is COMPLETED with all four agents done', () => {
    render(
      <JobStepper
        status="COMPLETED"
        agentsCompleted={['ingestion', 'normalisation', 'matching', 'report']}
      />,
    );
    for (const item of screen.getAllByRole('listitem')) {
      expect(item).toHaveAttribute('data-state', 'complete');
    }
  });
});
