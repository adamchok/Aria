import { cn } from '@/lib/cn';
import { confidenceLabel, formatPercent } from '@/lib/format';

interface ConfidenceBadgeProps {
  confidence: number;
  className?: string;
}

export function ConfidenceBadge({ confidence, className }: ConfidenceBadgeProps) {
  const palette =
    confidence >= 0.75
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : confidence >= 0.5
      ? 'bg-amber-50 text-amber-900 border-amber-200'
      : 'bg-rose-50 text-rose-800 border-rose-200';
  const label = confidenceLabel(confidence);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums',
        palette,
        className,
      )}
      aria-label={`Confidence ${formatPercent(confidence)} — ${label}`}
    >
      <span>{formatPercent(confidence)}</span>
      <span className="text-[10px] uppercase tracking-wide">{label}</span>
    </span>
  );
}
