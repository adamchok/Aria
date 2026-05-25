import { cn } from '@/lib/cn';
import type { JobStatus } from '@/types/api';

const JOB_STATUS_MAP: Record<
  JobStatus,
  { label: string; bg: string; fg: string; border: string }
> = {
  PENDING: { label: 'Pending', bg: 'bg-slate-100', fg: 'text-slate-600', border: 'border-slate-200' },
  INGESTING: { label: 'Ingesting', bg: 'bg-blue-50', fg: 'text-blue-700', border: 'border-blue-200' },
  NORMALISING: { label: 'Normalising', bg: 'bg-blue-50', fg: 'text-blue-700', border: 'border-blue-200' },
  MATCHING: { label: 'Matching', bg: 'bg-blue-50', fg: 'text-blue-700', border: 'border-blue-200' },
  REPORTING: { label: 'Reporting', bg: 'bg-blue-50', fg: 'text-blue-700', border: 'border-blue-200' },
  AWAITING_REVIEW: { label: 'Awaiting review', bg: 'bg-amber-50', fg: 'text-amber-800', border: 'border-amber-200' },
  COMPLETED: { label: 'Completed', bg: 'bg-emerald-50', fg: 'text-emerald-800', border: 'border-emerald-200' },
  FAILED: { label: 'Failed', bg: 'bg-rose-50', fg: 'text-rose-800', border: 'border-rose-200' },
  CANCELLED: { label: 'Cancelled', bg: 'bg-slate-100', fg: 'text-slate-500', border: 'border-slate-200' },
};

export function JobStatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  const c = JOB_STATUS_MAP[status] ?? JOB_STATUS_MAP.PENDING;
  return (
    <span
      role="status"
      aria-label={`Job status: ${c.label}`}
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
