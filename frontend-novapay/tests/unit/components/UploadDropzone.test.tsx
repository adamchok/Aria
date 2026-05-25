import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UploadDropzone } from '@/components/UploadDropzone';

function makeFile(name: string, type = 'image/png'): File {
  return new File(['x'], name, { type });
}

describe('UploadDropzone', () => {
  it('accepts supported files and calls onFiles', async () => {
    const onFiles = vi.fn();
    render(<UploadDropzone label="Drop here" multiple onFiles={onFiles} />);
    const input = screen.getByLabelText(/Drop here file input/i) as HTMLInputElement;
    const file = makeFile('proof.png');
    await userEvent.upload(input, file);
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it('rejects unsupported file types and shows an alert', async () => {
    const onFiles = vi.fn();
    render(<UploadDropzone label="Drop here" onFiles={onFiles} />);
    const input = screen.getByLabelText(/Drop here file input/i) as HTMLInputElement;
    await userEvent.upload(input, makeFile('virus.exe', 'application/octet-stream'), {
      applyAccept: false,
    });
    expect(onFiles).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Unsupported file type/i);
  });

  it('passes only the first file when multiple is false', async () => {
    const onFiles = vi.fn();
    render(<UploadDropzone label="Drop here" onFiles={onFiles} />);
    const input = screen.getByLabelText(/Drop here file input/i) as HTMLInputElement;
    await userEvent.upload(input, [makeFile('a.png'), makeFile('b.png')]);
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0]?.[0]).toHaveLength(1);
  });
});
