import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileList } from '@/components/FileList';

function makeFile(name: string, sizeKb = 1): File {
  const blob = new Blob([new Uint8Array(sizeKb * 1024)]);
  return new File([blob], name);
}

describe('FileList', () => {
  it('shows the empty label when there are no files', () => {
    render(<FileList files={[]} emptyLabel="Nothing yet." />);
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument();
  });

  it('renders one row per file with size', () => {
    render(<FileList files={[makeFile('a.png', 3), makeFile('b.csv', 2)]} />);
    const items = screen.getAllByTestId('file-list-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('a.png');
    expect(items[0]).toHaveTextContent('3.0 KB');
  });

  it('calls onRemove when the remove button is pressed', async () => {
    const onRemove = vi.fn();
    render(<FileList files={[makeFile('a.png')]} onRemove={onRemove} />);
    await userEvent.click(screen.getByRole('button', { name: /Remove a.png/i }));
    expect(onRemove).toHaveBeenCalledWith('a.png');
  });
});
