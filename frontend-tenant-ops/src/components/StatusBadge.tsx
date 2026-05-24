import { cn } from '@/lib/cn';
import { statusColor } from '@/lib/format';
import type { MatchStatus } from '@/types/api';

export function StatusBadge({ status, className }: { status: MatchStatus; className?: string }) {
  const c = statusColor(status);
  return (
    <span
      role="status"
      aria-label={`Status: ${c.label}`}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        c.bg,
        c.fg,
        c.border,
        className,
      )}
    >
      {c.label}
    </span>
  );
}
