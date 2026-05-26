import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

describe('ConfirmDialog', () => {
  it('renders title and message', () => {
    render(
      <ConfirmDialog
        title="Delete record"
        message="This cannot be undone."
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete record')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('uses "Confirm" as default confirmLabel', () => {
    render(
      <ConfirmDialog title="X" message="Y" onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument();
  });

  it('uses custom confirmLabel', () => {
    render(
      <ConfirmDialog
        title="X"
        message="Y"
        confirmLabel="Revoke key"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /revoke key/i })).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button clicked', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog title="X" message="Y" onConfirm={onConfirm} onClose={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('calls onClose when Cancel clicked', async () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog title="X" message="Y" onConfirm={vi.fn()} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Escape pressed', () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog title="X" message="Y" onConfirm={vi.fn()} onClose={onClose} />,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when backdrop clicked', async () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog title="X" message="Y" onConfirm={vi.fn()} onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('disables Cancel and shows spinner when loading', () => {
    render(
      <ConfirmDialog title="X" message="Y" loading onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });
});
