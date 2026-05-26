import { useState, type ReactNode } from 'react';

export interface ConfirmDialogState {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  onConfirm: () => void;
}

export function useConfirmDialog() {
  const [pending, setPending] = useState<ConfirmDialogState | null>(null);

  const open = (opts: ConfirmDialogState) => setPending(opts);
  const close = () => setPending(null);

  return { pending, open, close };
}
