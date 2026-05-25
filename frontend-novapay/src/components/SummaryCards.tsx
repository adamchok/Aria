import { Card, CardContent } from '@/components/ui/Card';
import { formatAmount } from '@/lib/format';
import type { ReconciliationSummary } from '@/types/api';

interface SummaryCardsProps {
  summary: ReconciliationSummary;
  baseCurrency: string;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
        {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function SummaryCards({ summary, baseCurrency }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Stat label="Total records" value={String(summary.total_records)} />
      <Stat
        label="Matched"
        value={String(summary.matched_count)}
        hint={formatAmount(summary.matched_value_myr, baseCurrency)}
      />
      <Stat label="Needs review" value={String(summary.uncertain_count)} />
      <Stat label="Unmatched" value={String(summary.unmatched_count)} />
      <Stat
        label="Total value"
        value={formatAmount(summary.total_value_myr, baseCurrency)}
        hint={`variance ${formatAmount(summary.total_variance_myr, baseCurrency, { signed: true })}`}
      />
    </div>
  );
}
