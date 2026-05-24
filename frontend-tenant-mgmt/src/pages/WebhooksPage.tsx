import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { WebhookEvent } from '@/types/api';
import type { WebhookResponse } from '@/types/api';

const ALL_EVENTS = [
  { value: WebhookEvent.JOB_COMPLETED, label: 'Job completed' },
  { value: WebhookEvent.JOB_FAILED, label: 'Job failed' },
  { value: WebhookEvent.JOB_REVIEW_REQUIRED, label: 'Review required' },
];

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: 'text-emerald-700 bg-emerald-50',
  FAILED: 'text-rose-700 bg-rose-50',
  PENDING: 'text-amber-700 bg-amber-50',
};

function WebhookCard({ webhook }: { webhook: WebhookResponse }) {
  const qc = useQueryClient();
  const [tested, setTested] = useState(false);
  const [showDeliveries, setShowDeliveries] = useState(false);

  const deliveriesQuery = useQuery({
    queryKey: ['webhooks', webhook.id, 'deliveries'],
    queryFn: () => api.listWebhookDeliveries(webhook.id),
    enabled: showDeliveries,
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteWebhook(webhook.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  const testMutation = useMutation({
    mutationFn: () => api.testWebhook(webhook.id),
    onSuccess: () => {
      setTested(true);
      setTimeout(() => setTested(false), 3_000);
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">
              {webhook.label || 'Unnamed webhook'}
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-slate-500">{webhook.url}</p>
          </div>
          <span
            className={`flex-shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
              webhook.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {webhook.enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* Events */}
        <div className="flex flex-wrap gap-1.5">
          {webhook.events.map((e) => (
            <span key={e} className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600">
              {e}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
          >
            {testMutation.isPending ? 'Sending…' : tested ? 'Sent!' : 'Send test event'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowDeliveries((s) => !s)}
          >
            {showDeliveries ? 'Hide deliveries' : 'View deliveries'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Removing…' : 'Remove'}
          </Button>
        </div>
        {testMutation.isError && (
          <p className="text-xs text-rose-600">Test failed: {testMutation.error instanceof Error ? testMutation.error.message : 'Unknown error'}</p>
        )}

        {/* Deliveries */}
        {showDeliveries && (
          <div className="mt-1 rounded border border-slate-200 bg-slate-50">
            {deliveriesQuery.isLoading && (
              <p className="p-3 text-xs text-slate-500">Loading deliveries…</p>
            )}
            {deliveriesQuery.data && deliveriesQuery.data.length === 0 && (
              <p className="p-3 text-xs text-slate-500">No deliveries yet.</p>
            )}
            {deliveriesQuery.data && deliveriesQuery.data.length > 0 && (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="py-2 pl-3 pr-2 text-[10px] font-medium text-slate-500">Event</th>
                    <th className="px-2 py-2 text-[10px] font-medium text-slate-500">Status</th>
                    <th className="px-2 py-2 text-[10px] font-medium text-slate-500">HTTP</th>
                    <th className="px-2 py-2 text-[10px] font-medium text-slate-500">Attempts</th>
                    <th className="py-2 pl-2 pr-3 text-[10px] font-medium text-slate-500">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveriesQuery.data.slice(0, 10).map((d) => (
                    <tr key={d.id} className="border-t border-slate-100">
                      <td className="py-2 pl-3 pr-2 font-mono text-[10px] text-slate-600">{d.event}</td>
                      <td className="px-2 py-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[d.status] ?? 'bg-slate-100 text-slate-500'}`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-[10px] tabular-nums text-slate-500">{d.response_code ?? '—'}</td>
                      <td className="px-2 py-2 text-[10px] tabular-nums text-slate-500">{d.attempt_count}</td>
                      <td className="py-2 pl-2 pr-3 text-[10px] text-slate-400">{d.created_at.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WebhooksPage() {
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([WebhookEvent.JOB_COMPLETED]);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const { data: webhooks, isLoading, isError } = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api.listWebhooks(),
    refetchInterval: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: () => api.createWebhook({ url, events: selectedEvents, label }),
    onSuccess: (data) => {
      if (data.secret) setNewSecret(data.secret);
      setUrl('');
      setLabel('');
      setSelectedEvents([WebhookEvent.JOB_COMPLETED]);
      void qc.invalidateQueries({ queryKey: ['webhooks'] });
    },
  });

  function toggleEvent(event: string) {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Webhooks</h1>
        <p className="mt-1 text-sm text-slate-500">
          Register HTTP endpoints to receive real-time job status events
        </p>
      </div>

      {/* Register new webhook */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Register webhook</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {newSecret && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
              <p className="mb-1 text-xs font-medium text-emerald-800">
                Webhook signing secret — save it now. It will not be shown again.
              </p>
              <code className="block break-all rounded bg-white px-2 py-1.5 text-xs font-mono text-slate-800 border border-emerald-200">
                {newSecret}
              </code>
            </div>
          )}
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="wh-url">
                Endpoint URL
              </label>
              <input
                id="wh-url"
                type="url"
                placeholder="https://your-service.example.com/webhooks/aria"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="wh-label">
                Label (optional)
              </label>
              <input
                id="wh-label"
                type="text"
                placeholder="Production webhook"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">Events</p>
              <div className="flex flex-wrap gap-2">
                {ALL_EVENTS.map((ev) => (
                  <label
                    key={ev.value}
                    className={`flex cursor-pointer items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                      selectedEvents.includes(ev.value)
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-slate-300 text-slate-600 hover:border-slate-400'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={selectedEvents.includes(ev.value)}
                      onChange={() => toggleEvent(ev.value)}
                    />
                    {ev.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !url || selectedEvents.length === 0}
            >
              {createMutation.isPending ? 'Registering…' : 'Register webhook'}
            </Button>
          </div>
          {createMutation.isError && (
            <p className="text-xs text-rose-600">
              {createMutation.error instanceof Error ? createMutation.error.message : 'Registration failed.'}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Registered webhooks */}
      {isLoading && (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      )}
      {isError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm text-rose-600" role="alert">Failed to load webhooks.</p>
          <Button variant="secondary" className="mt-2" onClick={() => void qc.invalidateQueries({ queryKey: ['webhooks'] })}>
            Retry
          </Button>
        </div>
      )}
      {webhooks?.length === 0 && !isLoading && (
        <p className="text-sm text-slate-500">No webhooks registered yet.</p>
      )}
      {webhooks?.map((wh) => (
        <WebhookCard key={wh.id} webhook={wh} />
      ))}
    </div>
  );
}
