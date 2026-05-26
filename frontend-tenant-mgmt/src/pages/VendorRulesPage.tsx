import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import type { VendorRule } from '@/types/api';

// ─── Icons ───────────────────────────────────────────────────────────────────

function BrainIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15M14.25 3.104c.251.023.501.05.75.082M19.8 15l-1.575 1.575A3.75 3.75 0 0115.75 18h-7.5a3.75 3.75 0 01-2.475-.925L4.2 15m15.6 0H4.2m0 0L3 16.2" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' });
}

const FIELD_COLORS: Record<string, string> = {
  currency: 'bg-blue-50 text-blue-700 ring-blue-200',
  payee: 'bg-violet-50 text-violet-700 ring-violet-200',
  reference: 'bg-amber-50 text-amber-700 ring-amber-200',
};

function FieldBadge({ field }: { field: string }) {
  const cls = FIELD_COLORS[field] ?? 'bg-slate-100 text-slate-600 ring-slate-200';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 capitalize ${cls}`}>
      {field}
    </span>
  );
}

// ─── Edit row ─────────────────────────────────────────────────────────────────

function EditRow({
  rule,
  onSave,
  onCancel,
  isPending,
}: {
  rule: VendorRule;
  onSave: (correctedValue: string, note: string) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [correctedValue, setCorrectedValue] = useState(rule.corrected_value);
  const [note, setNote] = useState(rule.source_note ?? '');

  return (
    <tr className="bg-violet-50/50">
      <td className="px-5 py-3 font-mono text-xs text-slate-700">{rule.payee_pattern}</td>
      <td className="px-5 py-3"><FieldBadge field={rule.field_name} /></td>
      <td className="px-5 py-3">
        <input
          type="text"
          value={correctedValue}
          onChange={(e) => setCorrectedValue(e.target.value)}
          className="w-full rounded-md border border-violet-300 px-2.5 py-1.5 text-sm text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          aria-label="Corrected value"
        />
      </td>
      <td className="px-5 py-3 text-xs text-slate-400">{rule.original_value ?? '—'}</td>
      <td className="px-5 py-3">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note…"
          className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          aria-label="Source note"
        />
      </td>
      <td className="px-5 py-3 text-xs text-slate-400">{rule.applied_count}</td>
      <td className="px-5 py-3 text-xs text-slate-400">{formatDate(rule.updated_at)}</td>
      <td className="px-5 py-3">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => onSave(correctedValue.trim(), note.trim())}
            disabled={isPending || !correctedValue.trim()}
            className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            aria-label="Save"
          >
            <CheckIcon /> Save
          </button>
          <button
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            aria-label="Cancel"
          >
            <XIcon /> Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function RuleRow({
  rule,
  onEdit,
  onDeleteClick,
}: {
  rule: VendorRule;
  onEdit: () => void;
  onDeleteClick: (id: string, pattern: string) => void;
}) {
  return (
    <tr className="transition-colors hover:bg-slate-50">
      <td className="px-5 py-4 font-mono text-xs text-slate-700">{rule.payee_pattern}</td>
      <td className="px-5 py-4"><FieldBadge field={rule.field_name} /></td>
      <td className="px-5 py-4 text-sm font-medium text-slate-900">{rule.corrected_value}</td>
      <td className="px-5 py-4 text-xs text-slate-400">{rule.original_value ?? '—'}</td>
      <td className="px-5 py-4 text-xs text-slate-500 max-w-[200px] truncate" title={rule.source_note ?? undefined}>
        {rule.source_note ?? <span className="text-slate-400">—</span>}
      </td>
      <td className="px-5 py-4 text-xs text-slate-500">{rule.applied_count}</td>
      <td className="px-5 py-4 text-xs text-slate-500">{formatDate(rule.updated_at)}</td>
      <td className="px-5 py-4">
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            aria-label={`Edit rule for ${rule.payee_pattern}`}
          >
            <PencilIcon /> Edit
          </button>
          <button
            onClick={() => onDeleteClick(rule.id, rule.payee_pattern)}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function VendorRulesPage() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const { pending: confirmPending, open: openConfirm, close: closeConfirm } = useConfirmDialog();

  const rulesQuery = useQuery({
    queryKey: ['vendor-rules'],
    queryFn: () => api.listVendorRules(),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, correctedValue, note }: { id: string; correctedValue: string; note: string }) =>
      api.updateVendorRule(id, { corrected_value: correctedValue, source_note: note || null }),
    onSuccess: () => {
      setEditingId(null);
      void qc.invalidateQueries({ queryKey: ['vendor-rules'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) => api.deleteVendorRule(ruleId),
    onSuccess: () => {
      closeConfirm();
      void qc.invalidateQueries({ queryKey: ['vendor-rules'] });
    },
  });

  function handleDeleteClick(id: string, pattern: string) {
    openConfirm({
      title: 'Delete feedback rule',
      message: (
        <>
          Delete the rule for <strong className="font-semibold">{pattern}</strong>? ARIA will no longer apply this
          correction automatically.
        </>
      ),
      confirmLabel: 'Delete rule',
      onConfirm: () => deleteMutation.mutate(id),
    });
  }

  const rules = rulesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">AI Feedback Rules</h1>
          <p className="mt-1 text-sm text-slate-500">
            Corrections ARIA has learned from your human review decisions
            {rulesQuery.data && (
              <span className="ml-2 inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200">
                {rules.length} {rules.length === 1 ? 'rule' : 'rules'}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <BrainIcon />
        </span>
        <div>
          <p className="text-sm font-medium text-blue-900">How ARIA learns</p>
          <p className="mt-0.5 text-xs text-blue-700">
            When you confirm or manually match a transaction in the review queue, ARIA saves a correction rule for that
            vendor. Future transactions with the same payee will have the corrected value pre-applied. You can edit or
            remove any rule below.
          </p>
        </div>
      </div>

      {/* Rules table */}
      <Card>
        <CardHeader>
          <CardTitle>Learned corrections</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rulesQuery.isLoading && (
            <div className="space-y-3 p-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          )}

          {rulesQuery.isError && (
            <div className="p-4">
              <p className="text-sm text-rose-600" role="alert">Failed to load rules.</p>
              <Button variant="secondary" className="mt-2" onClick={() => void rulesQuery.refetch()}>
                Retry
              </Button>
            </div>
          )}

          {rulesQuery.data && rules.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <BrainIcon />
              </span>
              <p className="text-sm font-medium text-slate-700">No rules yet</p>
              <p className="text-xs text-slate-500">
                ARIA will create rules automatically as you confirm or correct transactions in the review queue.
              </p>
            </div>
          )}

          {rulesQuery.data && rules.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Payee pattern</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Field</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Corrected value</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Original</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Note</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Applied</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Updated</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rules.map((rule) =>
                    editingId === rule.id ? (
                      <EditRow
                        key={rule.id}
                        rule={rule}
                        isPending={updateMutation.isPending}
                        onSave={(correctedValue, note) =>
                          updateMutation.mutate({ id: rule.id, correctedValue, note })
                        }
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <RuleRow
                        key={rule.id}
                        rule={rule}
                        onEdit={() => setEditingId(rule.id)}
                        onDeleteClick={handleDeleteClick}
                      />
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}

          {updateMutation.isError && (
            <div className="border-t border-slate-100 px-5 py-3">
              <p className="text-xs text-rose-600" role="alert">Failed to update rule. Please try again.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {confirmPending && (
        <ConfirmDialog
          {...confirmPending}
          loading={deleteMutation.isPending}
          onClose={closeConfirm}
        />
      )}
    </div>
  );
}
