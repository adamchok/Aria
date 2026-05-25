import { formatAmount } from '@/lib/format';
import { cn } from '@/lib/cn';

interface AmountCellProps {
  value: string | number;
  currency: string;
  className?: string;
  signed?: boolean;
}

export function AmountCell({ value, currency, className, signed }: AmountCellProps) {
  return (
    <span className={cn('text-right tabular-nums', className)}>
      {formatAmount(value, currency, signed ? { signed: true } : {})}
    </span>
  );
}
