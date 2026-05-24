import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useTenantStore } from '@/stores/tenant-store';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { ApiKeyResponse, TenantResponse } from '@/types/api';

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text);
}

function KeyRow({
  apiKey,
  onRevoke,
  revoking,
}: {
  apiKey: ApiKeyResponse;
  onRevoke: (id: string) => void;
  revoking: boolean;
}) {
  return (
    <tr className="border-t border-slate-100">
      <td className="py-3 pl-4 pr-3 text-sm font-medium text-slate-800">{apiKey.label || '(unlabelled)'}</td>
      <td className="px-3 py-3 text-xs font-mono text-slate-500">{apiKey.id.slice(0, 8)}…</td>
      <td className="px-3 py-3 text-xs text-slate-500">
        {apiKey.last_used_at ? apiKey.last_used_at.slice(0, 10) : 'Never'}
      </td>
      <td className="px-3 py-3">
        <span
          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
            apiKey.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {apiKey.enabled ? 'Active' : 'Revoked'}
        </span>
      </td>
      <td className="py-3 pl-3 pr-4 text-right">
        {apiKey.enabled && (
          <Button
            variant="secondary"
            onClick={() => onRevoke(apiKey.id)}
            disabled={revoking}
          >
            Revoke
          </Button>
        )}
      </td>
    </tr>
  );
}

function TenantCard({ tenant }: { tenant: TenantResponse }) {
  const qc = useQueryClient();
  const { setApiKey } = useTenantStore();

  const [newKey, setNewKey] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const keysQuery = useQuery({
    queryKey: ['tenants', tenant.id, 'keys'],
    queryFn: () => api.listApiKeys(tenant.id),
  });

  const createMutation = useMutation({
    mutationFn: () => api.createApiKey(tenant.id, label),
    onSuccess: (data) => {
      if (data.key) {
        setNewKey(data.key);
        setApiKey(data.key); // auto-set in session
      }
      setLabel('');
      void qc.invalidateQueries({ queryKey: ['tenants', tenant.id, 'keys'] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => api.revokeApiKey(tenant.id, keyId),
    onSuccess: () => {
      setRevokingId(null);
      void qc.invalidateQueries({ queryKey: ['tenants', tenant.id, 'keys'] });
    },
  });

  function handleCopy() {
    if (newKey) {
      copyToClipboard(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{tenant.name}</CardTitle>
        <p className="text-xs text-slate-500 font-mono">{tenant.id}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* New key reveal */}
        {newKey && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <p className="mb-1 text-xs font-medium text-emerald-800">
              API key created — copy it now. It will not be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded bg-white px-2 py-1 text-xs font-mono text-slate-800 border border-emerald-200">
                {newKey}
              </code>
              <Button variant="secondary" onClick={handleCopy}>
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          </div>
        )}

        {/* Create new key */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Generating…' : 'Generate key'}
          </Button>
        </div>
        {createMutation.isError && (
          <p className="text-xs text-rose-600">
            {createMutation.error instanceof Error ? createMutation.error.message : 'Failed to create key.'}
          </p>
        )}

        {/* Key list */}
        {keysQuery.isLoading && (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        )}
        {keysQuery.data && keysQuery.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="py-2 pl-4 pr-3 text-xs font-medium text-slate-500">Label</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-500">ID</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-500">Last used</th>
                  <th className="px-3 py-2 text-xs font-medium text-slate-500">Status</th>
                  <th className="py-2 pl-3 pr-4" />
                </tr>
              </thead>
              <tbody>
                {keysQuery.data.map((k) => (
                  <KeyRow
                    key={k.id}
                    apiKey={k}
                    revoking={revokingId === k.id && revokeMutation.isPending}
                    onRevoke={(id) => {
                      setRevokingId(id);
                      revokeMutation.mutate(id);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {keysQuery.data?.length === 0 && (
          <p className="text-sm text-slate-500">No API keys yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function ApiKeysPage() {
  const [newTenantName, setNewTenantName] = useState('');
  const qc = useQueryClient();

  const tenantsQuery = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.listTenants(),
  });

  const createTenantMutation = useMutation({
    mutationFn: () => api.createTenant(newTenantName.trim()),
    onSuccess: () => {
      setNewTenantName('');
      void qc.invalidateQueries({ queryKey: ['tenants'] });
    },
  });

  const { apiKey, setApiKey } = useTenantStore();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">API Keys</h1>
        <p className="mt-1 text-sm text-slate-500">Manage tenant API keys for programmatic access</p>
      </div>

      {/* Session API key */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Session key</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">
            The key below is sent with every API request from this browser session.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              placeholder="Paste an API key to authenticate"
              value={apiKey ?? ''}
              onChange={(e) => setApiKey(e.target.value || null)}
              className="flex-1 rounded border border-slate-300 px-3 py-1.5 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {apiKey && (
              <Button variant="secondary" onClick={() => setApiKey(null)}>
                Clear
              </Button>
            )}
          </div>
          {apiKey && (
            <p className="text-xs text-emerald-700">
              Active — API requests will include this key.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Create tenant */}
      {tenantsQuery.data !== undefined && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Create tenant</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Requires admin credentials (ADMIN_API_KEY). Each tenant has its own isolated data and API keys.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Tenant name"
                value={newTenantName}
                onChange={(e) => setNewTenantName(e.target.value)}
                className="flex-1 rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <Button
                onClick={() => createTenantMutation.mutate()}
                disabled={createTenantMutation.isPending || !newTenantName.trim()}
              >
                {createTenantMutation.isPending ? 'Creating…' : 'Create'}
              </Button>
            </div>
            {createTenantMutation.isError && (
              <p className="text-xs text-rose-600">
                {createTenantMutation.error instanceof Error
                  ? createTenantMutation.error.message
                  : 'Failed to create tenant.'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tenant list */}
      {tenantsQuery.isLoading && (
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      )}
      {tenantsQuery.isError && (
        <p className="text-sm text-slate-500">
          Unable to list tenants — admin key may be required. Use the session key field above to authenticate.
        </p>
      )}
      {tenantsQuery.data?.map((tenant) => (
        <TenantCard key={tenant.id} tenant={tenant} />
      ))}
    </div>
  );
}
