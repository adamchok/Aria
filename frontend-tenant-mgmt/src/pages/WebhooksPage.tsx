import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { WebhookEvent } from '@/types/api';
import type { WebhookResponse, WebhookDeliveryResponse } from '@/types/api';

// ─── Event metadata ──────────────────────────────────────────────────────────

const EVENT_META: Record<string, { label: string; chip: string; formChip: string }> = {
  'job.created': {
    label: 'Job created',
    chip: 'border border-blue-200 bg-blue-50 text-blue-700',
    formChip: 'border-blue-400 bg-blue-50 text-blue-700',
  },
  'job.completed': {
    label: 'Job completed',
    chip: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
    formChip: 'border-emerald-400 bg-emerald-50 text-emerald-700',
  },
  'job.failed': {
    label: 'Job failed',
    chip: 'border border-rose-200 bg-rose-50 text-rose-700',
    formChip: 'border-rose-400 bg-rose-50 text-rose-700',
  },
  'job.review_required': {
    label: 'Review required',
    chip: 'border border-amber-200 bg-amber-50 text-amber-700',
    formChip: 'border-amber-400 bg-amber-50 text-amber-700',
  },
  'job.stage_completed': {
    label: 'Stage completed',
    chip: 'border border-slate-200 bg-slate-100 text-slate-600',
    formChip: 'border-slate-400 bg-slate-100 text-slate-600',
  },
};

const ALL_EVENTS = [
  { value: WebhookEvent.JOB_CREATED },
  { value: WebhookEvent.JOB_COMPLETED },
  { value: WebhookEvent.JOB_FAILED },
  { value: WebhookEvent.JOB_REVIEW_REQUIRED },
  { value: WebhookEvent.JOB_STAGE_COMPLETED },
];

// ─── Delivery status ──────────────────────────────────────────────────────────

const STATUS_META: Record<string, { badge: string; dot: string }> = {
  SUCCESS: { badge: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-400' },
  FAILED: { badge: 'bg-rose-50 text-rose-700', dot: 'bg-rose-400' },
  PENDING: { badge: 'bg-amber-50 text-amber-700', dot: 'bg-amber-400' },
  DISABLED: { badge: 'bg-slate-100 text-slate-500', dot: 'bg-slate-300' },
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={copy}
      className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-200"
    >
      {copied ? 'Copied!' : label}
    </button>
  );
}

function EventChip({ event }: { event: string }) {
  const meta = EVENT_META[event];
  return (
    <span className={`rounded border px-2 py-0.5 font-mono text-[10px] ${meta?.chip ?? 'border-slate-200 bg-slate-100 text-slate-600'}`}>
      {event}
    </span>
  );
}

// ─── Delivery row ──────────────────────────────────────────────────────────────

function DeliveryRow({
  d,
  resendingId,
  onResend,
}: {
  d: WebhookDeliveryResponse;
  resendingId: string | null;
  onResend: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusMeta = STATUS_META[d.status] ?? STATUS_META.PENDING;

  return (
    <>
      <tr
        className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
        onClick={() => setExpanded((s) => !s)}
      >
        <td className="py-2 pl-3 pr-2">
          <EventChip event={d.event} />
        </td>
        <td className="px-2 py-2">
          <span className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${statusMeta.badge}`}>
            <span className={`size-1.5 rounded-full ${statusMeta.dot}`} />
            {d.status}
          </span>
        </td>
        <td className="px-2 py-2 font-mono text-[10px] tabular-nums text-slate-500">
          {d.response_code ?? '—'}
        </td>
        <td className="px-2 py-2 text-[10px] tabular-nums text-slate-500">{d.attempt_count}</td>
        <td className="px-2 py-2 text-[10px] text-slate-400" title={d.created_at}>
          {timeAgo(d.created_at)}
        </td>
        <td className="py-2 pl-2 pr-3">
          {(d.status === 'FAILED' || d.status === 'PENDING') && (
            <button
              onClick={(e) => { e.stopPropagation(); onResend(d.id); }}
              disabled={resendingId === d.id}
              className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50"
            >
              {resendingId === d.id ? 'Queued…' : 'Resend'}
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-slate-100 bg-slate-50">
          <td colSpan={6} className="px-3 py-2">
            <p className="mb-1 text-[10px] font-medium text-slate-500">Response body</p>
            <pre className="overflow-x-auto rounded bg-white p-2 font-mono text-[10px] text-slate-700 border border-slate-200">
              {d.response_body ?? '(no response body)'}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Webhook card ─────────────────────────────────────────────────────────────

function WebhookCard({ webhook }: { webhook: WebhookResponse }) {
  const qc = useQueryClient();
  const [tested, setTested] = useState(false);
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const deliveriesQuery = useQuery({
    queryKey: ['webhooks', webhook.id, 'deliveries'],
    queryFn: () => api.listWebhookDeliveries(webhook.id),
    enabled: showDeliveries,
    refetchInterval: showDeliveries ? 10_000 : false,
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteWebhook(webhook.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  const testMutation = useMutation({
    mutationFn: () => api.testWebhook(webhook.id),
    onSuccess: () => {
      setTested(true);
      setShowDeliveries(true);
      void qc.invalidateQueries({ queryKey: ['webhooks', webhook.id, 'deliveries'] });
      setTimeout(() => setTested(false), 3_000);
    },
  });

  const resendMutation = useMutation({
    mutationFn: (deliveryId: string) => api.resendWebhookDelivery(webhook.id, deliveryId),
    onMutate: (deliveryId) => setResendingId(deliveryId),
    onSettled: () => {
      setResendingId(null);
      void qc.invalidateQueries({ queryKey: ['webhooks', webhook.id, 'deliveries'] });
    },
  });

  const deliveries = deliveriesQuery.data ?? [];
  const successCount = deliveries.filter((d) => d.status === 'SUCCESS').length;
  const successRate = deliveries.length > 0 ? Math.round((successCount / deliveries.length) * 100) : null;

  return (
    <Card>
      {/* Header */}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-semibold text-slate-800">
                {webhook.label || 'Unnamed webhook'}
              </p>
              <span
                className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  webhook.enabled
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {webhook.enabled ? '● Enabled' : '○ Disabled'}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <p className="truncate font-mono text-xs text-slate-500">{webhook.url}</p>
              <CopyButton text={webhook.url} label="Copy URL" />
            </div>
          </div>
          <p className="flex-shrink-0 text-xs text-slate-400" title={webhook.created_at}>
            {timeAgo(webhook.created_at)}
          </p>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Events */}
        <div>
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Subscribed events
          </p>
          <div className="flex flex-wrap gap-1.5">
            {webhook.events.map((e) => (
              <EventChip key={e} event={e} />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
          >
            {testMutation.isPending ? 'Sending…' : tested ? '✓ Sent!' : 'Send test'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowDeliveries((s) => !s)}
          >
            {showDeliveries
              ? 'Hide deliveries'
              : `View deliveries${deliveries.length > 0 ? ` (${deliveries.length})` : ''}`}
          </Button>
          <div className="ml-auto">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Remove this webhook?</span>
                <button
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="rounded bg-rose-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Removing…' : 'Confirm'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded px-2.5 py-1 text-xs text-slate-400 hover:text-rose-600"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {testMutation.isError && (
          <p className="rounded bg-rose-50 px-3 py-2 text-xs text-rose-600">
            Test failed: {testMutation.error instanceof Error ? testMutation.error.message : 'Unknown error'}
          </p>
        )}

        {/* Deliveries panel */}
        {showDeliveries && (
          <div className="rounded-md border border-slate-200 bg-slate-50">
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              <p className="text-xs font-medium text-slate-600">Delivery log</p>
              {successRate !== null && (
                <span className="text-[10px] text-slate-400">
                  {successRate}% success ({deliveries.length} total)
                </span>
              )}
            </div>

            {deliveriesQuery.isLoading && (
              <p className="p-3 text-xs text-slate-500">Loading…</p>
            )}
            {!deliveriesQuery.isLoading && deliveries.length === 0 && (
              <p className="p-3 text-xs text-slate-500">No deliveries yet. Send a test event to verify connectivity.</p>
            )}
            {deliveries.length > 0 && (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="py-2 pl-3 pr-2 text-[10px] font-medium text-slate-500">Event</th>
                    <th className="px-2 py-2 text-[10px] font-medium text-slate-500">Status</th>
                    <th className="px-2 py-2 text-[10px] font-medium text-slate-500">HTTP</th>
                    <th className="px-2 py-2 text-[10px] font-medium text-slate-500">Attempts</th>
                    <th className="px-2 py-2 text-[10px] font-medium text-slate-500">Time</th>
                    <th className="py-2 pl-2 pr-3 text-[10px] font-medium text-slate-500"></th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.slice(0, 20).map((d) => (
                    <DeliveryRow
                      key={d.id}
                      d={d}
                      resendingId={resendingId}
                      onResend={(id) => resendMutation.mutate(id)}
                    />
                  ))}
                </tbody>
              </table>
            )}
            {deliveries.length > 20 && (
              <p className="border-t border-slate-200 px-3 py-2 text-[10px] text-slate-400">
                Showing most recent 20 of {deliveries.length} deliveries.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Secret banner ────────────────────────────────────────────────────────────

function SecretBanner({ secret, onDismiss }: { secret: string; onDismiss: () => void }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-emerald-800">
          Webhook registered — save your signing secret
        </p>
        <button onClick={onDismiss} className="text-xs text-emerald-600 hover:text-emerald-800">
          Dismiss
        </button>
      </div>
      <p className="mb-2 text-xs text-emerald-700">
        This secret will not be shown again. Use it to verify the{' '}
        <code className="rounded bg-emerald-100 px-1">X-ARIA-Signature</code> header on incoming requests.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-slate-800">
          {secret}
        </code>
        <CopyButton text={secret} label="Copy" />
      </div>
    </div>
  );
}

// ─── Register modal ───────────────────────────────────────────────────────────

function RegisterWebhookModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (secret: string) => void;
}) {
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    WebhookEvent.JOB_COMPLETED,
    WebhookEvent.JOB_FAILED,
  ]);

  const createMutation = useMutation({
    mutationFn: () => api.createWebhook({ url, events: selectedEvents, label }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ['webhooks'] });
      onCreated(data.secret ?? '');
      onClose();
    },
  });

  function toggleEvent(event: string) {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  }

  const urlValid = url.startsWith('https://') || url.startsWith('http://');

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={handleKeyDown}
    >
      <div className="relative mx-4 w-full max-w-lg rounded-xl bg-white shadow-xl">
        {/* Modal header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Register webhook</h2>
            <p className="mt-0.5 text-xs text-slate-500">Deliver real-time events to your HTTP endpoint</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <svg className="size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        {/* Modal body */}
        <div className="flex flex-col gap-5 px-6 py-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600" htmlFor="m-wh-url">
              Endpoint URL <span className="text-rose-500">*</span>
            </label>
            <input
              id="m-wh-url"
              type="url"
              autoFocus
              placeholder="https://your-service.example.com/webhooks/aria"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${
                url && !urlValid
                  ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500'
                  : 'border-slate-300 focus:border-violet-500 focus:ring-violet-500'
              }`}
            />
            {url && !urlValid && (
              <p className="mt-1 text-xs text-rose-500">Must start with https:// or http://</p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600" htmlFor="m-wh-label">
              Label <span className="text-slate-400">(optional)</span>
            </label>
            <input
              id="m-wh-label"
              type="text"
              placeholder="Production webhook"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-600">
              Subscribe to events <span className="text-rose-500">*</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL_EVENTS.map((ev) => {
                const meta = EVENT_META[ev.value];
                const active = selectedEvents.includes(ev.value);
                return (
                  <label
                    key={ev.value}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? (meta?.formChip ?? 'border-violet-400 bg-violet-50 text-violet-700')
                        : 'border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={active}
                      onChange={() => toggleEvent(ev.value)}
                    />
                    <span className="font-mono">{ev.value}</span>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-slate-400">
              Select at least one event. Click a row in the delivery log to inspect the response body.
            </p>
          </div>

        </div>

        {/* Modal footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4">
          {createMutation.isError && (
            <p className="text-xs text-rose-600">
              {createMutation.error instanceof Error
                ? createMutation.error.message
                : 'Registration failed.'}
            </p>
          )}
          {!createMutation.isError && <span />}
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !url || !urlValid || selectedEvents.length === 0}
            >
              {createMutation.isPending ? 'Registering…' : 'Register webhook'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function WebhooksPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const { data: webhooks, isLoading, isError } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api.listWebhooks(),
    refetchInterval: 30_000,
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Webhooks</h1>
          <p className="mt-1 text-sm text-slate-500">
            Deliver real-time job status events to your HTTP endpoints.
            {webhooks && webhooks.length > 0 && (
              <span className="ml-1 text-slate-400">
                {webhooks.length} webhook{webhooks.length !== 1 ? 's' : ''} registered.
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => setShowModal(true)}>+ Add webhook</Button>
      </div>

      {/* Secret banner (shown after successful registration) */}
      {newSecret && (
        <SecretBanner secret={newSecret} onDismiss={() => setNewSecret(null)} />
      )}

      {/* Webhook list */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-medium text-rose-700">Failed to load webhooks</p>
          <p className="mt-0.5 text-xs text-rose-600">Check your connection and try again.</p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => void qc.invalidateQueries({ queryKey: ['webhooks'] })}
          >
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && webhooks?.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">No webhooks registered</p>
          <p className="mt-1 text-xs text-slate-500">
            Add an endpoint to start receiving job events in real time.
          </p>
          <Button className="mt-4" onClick={() => setShowModal(true)}>
            + Add webhook
          </Button>
        </div>
      )}

      {webhooks?.map((wh) => (
        <WebhookCard key={wh.id} webhook={wh} />
      ))}

      {/* Register modal */}
      {showModal && (
        <RegisterWebhookModal
          onClose={() => setShowModal(false)}
          onCreated={(secret) => {
            if (secret) setNewSecret(secret);
          }}
        />
      )}
    </div>
  );
}
