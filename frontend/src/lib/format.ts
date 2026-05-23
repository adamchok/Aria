/**
 * Display helpers. Monetary values are kept as Decimal strings on the wire;
 * we only convert to `number` here for Intl formatting.
 */

import type { MatchStatus } from '@/types/api';

export interface FormatAmountOptions {
  /** When true, signed amounts render with a leading + for positive values. */
  signed?: boolean;
  /** Force a specific minimum/maximum fraction digit count. Defaults: 2/2. */
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

export function formatAmount(
  value: string | number,
  currency: string,
  options: FormatAmountOptions = {},
): string {
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(numeric)) return `${currency} ${value}`;

  const formatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: options.minimumFractionDigits ?? 2,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  });
  const body = formatter.format(Math.abs(numeric));
  const sign = numeric < 0 ? '-' : options.signed && numeric > 0 ? '+' : '';
  return `${currency} ${sign}${body}`;
}

export function formatPercent(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.75) return 'High confidence';
  if (confidence >= 0.5) return 'Needs review';
  return 'Low confidence';
}

export function statusColor(status: MatchStatus): {
  bg: string;
  fg: string;
  border: string;
  label: string;
} {
  switch (status) {
    case 'MATCHED':
      return {
        bg: 'bg-emerald-50',
        fg: 'text-emerald-800',
        border: 'border-emerald-200',
        label: 'Matched',
      };
    case 'UNCERTAIN':
      return {
        bg: 'bg-amber-50',
        fg: 'text-amber-900',
        border: 'border-amber-200',
        label: 'Needs review',
      };
    case 'UNMATCHED':
      return {
        bg: 'bg-rose-50',
        fg: 'text-rose-800',
        border: 'border-rose-200',
        label: 'Unmatched',
      };
  }
}

export function formatDate(iso: string): string {
  // YYYY-MM-DD shown unchanged — finance teams prefer ISO over locale guesses.
  return iso;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}
