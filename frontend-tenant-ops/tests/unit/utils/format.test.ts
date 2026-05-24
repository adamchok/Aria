import { describe, expect, it } from 'vitest';
import {
  confidenceLabel,
  formatAmount,
  formatBytes,
  formatNarrative,
  formatPercent,
  statusColor,
} from '@/lib/format';

describe('formatAmount', () => {
  it('renders ISO currency + tabular value to 2dp', () => {
    expect(formatAmount('1234.50', 'USD')).toBe('USD 1,234.50');
    expect(formatAmount('0', 'MYR')).toBe('MYR 0.00');
  });

  it('preserves negative amounts and shows the sign', () => {
    expect(formatAmount('-12.30', 'MYR')).toBe('MYR -12.30');
  });

  it('shows a leading + for signed positive amounts when requested', () => {
    expect(formatAmount('5.00', 'MYR', { signed: true })).toBe('MYR +5.00');
    expect(formatAmount('-5.00', 'MYR', { signed: true })).toBe('MYR -5.00');
    expect(formatAmount('0', 'MYR', { signed: true })).toBe('MYR 0.00');
  });

  it('falls back gracefully on non-numeric input', () => {
    expect(formatAmount('not-a-number', 'USD')).toBe('USD not-a-number');
  });
});

describe('formatPercent', () => {
  it('returns N% for finite numbers', () => {
    expect(formatPercent(0.82)).toBe('82%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0.123, 1)).toBe('12.3%');
  });

  it('returns em-dash for NaN', () => {
    expect(formatPercent(Number.NaN)).toBe('—');
  });
});

describe('confidenceLabel', () => {
  it('uses the spec thresholds', () => {
    expect(confidenceLabel(0.49)).toBe('Low confidence');
    expect(confidenceLabel(0.5)).toBe('Needs review');
    expect(confidenceLabel(0.74)).toBe('Needs review');
    expect(confidenceLabel(0.75)).toBe('High confidence');
    expect(confidenceLabel(0.99)).toBe('High confidence');
  });
});

describe('statusColor', () => {
  it('maps each MatchStatus to a unique label', () => {
    expect(statusColor('MATCHED').label).toBe('Matched');
    expect(statusColor('UNCERTAIN').label).toBe('Needs review');
    expect(statusColor('UNMATCHED').label).toBe('Unmatched');
  });
});

describe('formatNarrative', () => {
  it('strips markdown bold and stray carets from LLM output', () => {
    const raw =
      '**Reconciliation Executive Narrative**\n\n**2 payment records** totalling MYR 99.25^^.';
    expect(formatNarrative(raw)).toBe('2 payment records totalling MYR 99.25.');
  });
});

describe('formatBytes', () => {
  it('chooses the right unit', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});
