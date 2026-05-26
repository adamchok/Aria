import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import type { ApiKeyResponse } from '@/types/api';

// ─── Icons ───────────────────────────────────────────────────────────────────

function KeyIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
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

function ShieldIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' });
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

// ─── Copy button with tick feedback ──────────────────────────────────────────

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(text).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      title={done ? 'Copied!' : `Copy ${label}`}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
        done
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
      }`}
    >
      {done ? <CheckIcon /> : <CopyIcon />}
      {done ? 'Copied' : label}
    </button>
  );
}

// ─── New key reveal banner ────────────────────────────────────────────────────

function NewKeyBanner({ apiKey, onDismiss }: { apiKey: string; onDismiss: () => void }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5" role="alert">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <ShieldIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-900">Your new API key</p>
          <p className="mt-0.5 text-xs text-emerald-700">
            Copy it now — this is the only time it will be shown in full.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="flex-1 break-all rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-slate-800 shadow-sm select-all">
              {apiKey}
            </code>
            <CopyButton text={apiKey} label="Copy key" />
          </div>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="ml-2 shrink-0 text-emerald-500 hover:text-emerald-700 focus-visible:outline-none"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
      enabled ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200'
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden="true" />
      {enabled ? 'Active' : 'Revoked'}
    </span>
  );
}


// ─── Page ─────────────────────────────────────────────────────────────────────

export function ApiKeysPage() {
  const qc = useQueryClient();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const { pending: confirmPending, open: openConfirm, close: closeConfirm } = useConfirmDialog();

  const keysQuery = useQuery({
    queryKey: ['tenant', 'keys'],
    queryFn: () => api.listTenantKeys(),
  });

  const createMutation = useMutation({
    mutationFn: () => api.createTenantKey(label.trim()),
    onSuccess: (data) => {
      if (data.key) setNewKey(data.key);
      setLabel('');
      void qc.invalidateQueries({ queryKey: ['tenant', 'keys'] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => api.revokeTenantKey(keyId),
    onSuccess: () => {
      closeConfirm();
      void qc.invalidateQueries({ queryKey: ['tenant', 'keys'] });
    },
  });

  function handleRevokeClick(k: ApiKeyResponse) {
    openConfirm({
      title: 'Revoke API key',
      message: (
        <>
          Revoke <strong className="font-semibold">{k.label || 'this key'}</strong>? Any integrations using it will
          stop working immediately. This cannot be undone.
        </>
      ),
      confirmLabel: 'Revoke key',
      onConfirm: () => revokeMutation.mutate(k.id),
    });
  }

  const activeCount = keysQuery.data?.filter((k) => k.enabled).length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">API Keys</h1>
          <p className="mt-1 text-sm text-slate-500">
            Programmatic access keys for your account
            {keysQuery.data && (
              <span className="ml-2 inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200">
                {activeCount} active
              </span>
            )}
          </p>
        </div>
      </div>

      {/* New key banner */}
      {newKey && <NewKeyBanner apiKey={newKey} onDismiss={() => setNewKey(null)} />}

      {/* Generate key panel */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
              <KeyIcon />
            </span>
            <div>
              <CardTitle>Generate new key</CardTitle>
              <p className="text-xs text-slate-500 mt-0.5">Label helps you identify where the key is used</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => { e.preventDefault(); if (label.trim()) createMutation.mutate(); }}
          >
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="key-label" className="text-xs font-medium text-slate-700">
                Key label <span className="text-slate-400">(e.g. "Production server", "CI pipeline")</span>
              </label>
              <input
                id="key-label"
                type="text"
                placeholder="My integration"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </div>
            <Button
              type="submit"
              disabled={!label.trim()}
              loading={createMutation.isPending}
              className="sm:w-auto"
            >
              Generate key
            </Button>
          </form>
          {createMutation.isError && (
            <p className="mt-2 text-xs text-rose-600" role="alert">
              Failed to generate key. Please try again.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Keys list */}
      <Card>
        <CardHeader>
          <CardTitle>Your keys</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {keysQuery.isLoading && (
            <div className="space-y-3 p-4">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          )}

          {keysQuery.isError && (
            <div className="p-4">
              <p className="text-sm text-rose-600" role="alert">Failed to load API keys.</p>
              <Button variant="secondary" className="mt-2" onClick={() => void keysQuery.refetch()}>
                Retry
              </Button>
            </div>
          )}

          {keysQuery.data && keysQuery.data.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <KeyIcon />
              </span>
              <p className="text-sm font-medium text-slate-700">No API keys yet</p>
              <p className="text-xs text-slate-500">Generate a key above to start integrating programmatically.</p>
            </div>
          )}

          {keysQuery.data && keysQuery.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Label</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Last used</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Created</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Expires</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {keysQuery.data.map((k: ApiKeyResponse) => (
                    <tr key={k.id} className={`transition-colors ${k.enabled ? 'hover:bg-slate-50' : 'opacity-50'}`}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">
                            {k.label || <span className="italic text-slate-400">Unlabelled</span>}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 select-all">
                            {k.id.slice(0, 8)}…
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge enabled={k.enabled} />
                      </td>
                      <td className="px-5 py-4 text-slate-500" title={k.last_used_at ?? undefined}>
                        {relativeTime(k.last_used_at)}
                      </td>
                      <td className="px-5 py-4 text-slate-500">
                        {formatDate(k.created_at)}
                      </td>
                      <td className="px-5 py-4 text-slate-500">
                        {k.expires_at ? formatDate(k.expires_at) : <span className="text-slate-400">Never</span>}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {k.enabled ? (
                          <button
                            onClick={() => handleRevokeClick(k)}
                            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                          >
                            Revoke
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {confirmPending && (
        <ConfirmDialog
          {...confirmPending}
          loading={revokeMutation.isPending}
          onClose={closeConfirm}
        />
      )}

      {/* Security note */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <p className="text-xs text-amber-800">
          Keep API keys secret. Never commit them to source control. Revoke and rotate immediately if compromised.
          Each key grants full API access scoped to your account.
        </p>
      </div>
    </div>
  );
}
