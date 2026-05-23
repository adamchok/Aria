import { useMemo, useState, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type {
  ColDef,
  RowClickedEvent,
  ValueFormatterParams,
} from 'ag-grid-community';
import { ModuleRegistry, ClientSideRowModelModule } from 'ag-grid-community';

import { StatusBadge } from '@/components/StatusBadge';
import { ConfidenceBadge } from '@/components/ConfidenceBadge';
import type { MatchResult, MatchStatus } from '@/types/api';
import { formatAmount } from '@/lib/format';

ModuleRegistry.registerModules([ClientSideRowModelModule]);

type FilterValue = 'ALL' | MatchStatus;

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'MATCHED', label: 'Matched' },
  { value: 'UNCERTAIN', label: 'Needs review' },
  { value: 'UNMATCHED', label: 'Unmatched' },
];

interface ReconciliationGridProps {
  matches: MatchResult[];
  baseCurrency: string;
  onRowClick?: (match: MatchResult) => void;
}

export function ReconciliationGrid({ matches, baseCurrency, onRowClick }: ReconciliationGridProps) {
  const [filter, setFilter] = useState<FilterValue>('ALL');

  const filtered = useMemo(
    () => (filter === 'ALL' ? matches : matches.filter((m) => m.status === filter)),
    [matches, filter],
  );

  const columnDefs = useMemo<ColDef<MatchResult>[]>(
    () => [
      {
        headerName: 'Value date',
        field: 'normalised_record.payment.value_date',
        flex: 1,
        minWidth: 120,
      },
      {
        headerName: 'Payer',
        field: 'normalised_record.payment.payer',
        flex: 1.5,
        minWidth: 180,
      },
      {
        headerName: 'Original',
        flex: 1,
        type: 'rightAligned',
        cellClass: 'tabular-nums',
        valueGetter: (p) =>
          p.data
            ? formatAmount(p.data.normalised_record.payment.amount_original, p.data.normalised_record.payment.currency)
            : '',
      },
      {
        headerName: `Amount (${baseCurrency})`,
        flex: 1,
        type: 'rightAligned',
        cellClass: 'tabular-nums',
        valueGetter: (p) =>
          p.data
            ? formatAmount(p.data.normalised_record.amount_myr_at_settlement_rate, baseCurrency)
            : '',
      },
      {
        headerName: 'Reference',
        field: 'normalised_record.payment.reference',
        flex: 1,
        valueFormatter: (p: ValueFormatterParams) => p.value ?? '—',
      },
      {
        headerName: 'Status',
        flex: 1,
        cellRenderer: (p: { data: MatchResult }) => (p.data ? <StatusBadge status={p.data.status} /> : null),
      },
      {
        headerName: 'Confidence',
        flex: 1,
        cellRenderer: (p: { data: MatchResult }) =>
          p.data ? <ConfidenceBadge confidence={p.data.confidence} /> : null,
      },
      {
        headerName: `Variance (${baseCurrency})`,
        flex: 1,
        type: 'rightAligned',
        cellClass: 'tabular-nums',
        valueGetter: (p) =>
          p.data ? formatAmount(p.data.amount_variance_myr, baseCurrency, { signed: true }) : '',
      },
    ],
    [baseCurrency],
  );

  const handleRowClicked = useCallback(
    (e: RowClickedEvent<MatchResult>) => {
      if (e.data && onRowClick) onRowClick(e.data);
    },
    [onRowClick],
  );

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Filter matches" className="inline-flex w-fit rounded-md border border-slate-200 bg-white p-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            role="tab"
            aria-selected={filter === f.value}
            data-active={filter === f.value ? '' : undefined}
            onClick={() => setFilter(f.value)}
            className={
              filter === f.value
                ? 'rounded px-3 py-1 text-sm font-medium bg-slate-900 text-white'
                : 'rounded px-3 py-1 text-sm font-medium text-slate-600 hover:text-slate-900'
            }
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="ag-theme-quartz" style={{ minHeight: 420 }} data-testid="reconciliation-grid">
        <AgGridReact<MatchResult>
          rowData={filtered}
          columnDefs={columnDefs}
          domLayout="autoHeight"
          rowHeight={48}
          onRowClicked={handleRowClicked}
          getRowId={(p) => p.data.id}
          ensureDomOrder
        />
      </div>
    </div>
  );
}
