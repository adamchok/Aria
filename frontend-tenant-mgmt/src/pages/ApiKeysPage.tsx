import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { ApiKeyResponse } from '@/types/api';

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text);
}

export function ApiKeysPage() {
  const qc = useQueryClient();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const keysQuery = useQuery({
    queryKey: ['tenant', 'keys'],
    queryFn: () => api.listTenantKeys(),
  });

  const createMutation = useMutation({
    mutationFn: () => api.createTenantKey(label),
    onSuccess: (data) => {
      if (data.key) setNewKey(data.key);
      setLabel('');
      void qc.invalidateQueries({ queryKey: ['tenant', 'keys'] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => api.revokeTenantKey(keyId),
    onSuccess: () => {
      setRevokingId(null);
      void qc.invalidateQueries({ queryKey: ['tenant', 'keys'] });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">API Keys</h1>
        <p className="mt-1 text-sm text-slate-500">Programmatic access keys for your tenant</p>
      </div>

      {newKey && (
        <Card>
          <CardContent className="pt-5">
            <p className="mb-2 text-sm font-medium text-emerald-800">New key — copy now, shown once:</p>
            <div className="flex gap-2">
              <code className="flex-1 break-all rounded border bg-slate-50 px-2 py-1 text-xs">{newKey}</code>
              <Button variant="secondary" onClick={() => { copyToClipboard(newKey); setCopied(true); }}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Keys</CardTitle>
          <div className="flex gap-2">
            <input
              type="text"
              aria-label="Key label"
              placeholder="Label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              Generate
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {keysQuery.isLoading && <p className="p-4 text-sm text-slate-500">Loading…</p>}
          {keysQuery.isError && (
            <div className="p-4">
              <p className="text-sm text-rose-600" role="alert">Failed to load API keys.</p>
              <Button variant="secondary" className="mt-2" onClick={() => void keysQuery.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {keysQuery.data && keysQuery.data.length === 0 && !keysQuery.isLoading && (
            <p className="p-4 text-sm text-slate-500">No API keys yet. Generate one to integrate programmatically.</p>
          )}
          {keysQuery.data && keysQuery.data.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-2">Label</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {keysQuery.data.map((k: ApiKeyResponse) => (
                  <tr key={k.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{k.label || '(unlabelled)'}</td>
                    <td className="px-4 py-3">{k.enabled ? 'Active' : 'Revoked'}</td>
                    <td className="px-4 py-3 text-right">
                      {k.enabled && (
                        <Button
                          variant="secondary"
                          disabled={revokingId === k.id}
                          onClick={() => { setRevokingId(k.id); revokeMutation.mutate(k.id); }}
                        >
                          Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
