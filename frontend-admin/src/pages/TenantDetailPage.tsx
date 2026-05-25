import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ApiKeyResponse, TenantResponse, UserResponse } from '@/types/api';

// ─── Icons ────────────────────────────────────────────────────────────────────

function PlusIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' });
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

function initials(email: string): string {
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

// ─── Role badge ───────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  if (role === 'admin') {
    return (
      <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200">
        Platform admin
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
      Tenant user
    </span>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden="true" />
      Inactive
    </span>
  );
}

function KeyStatusBadge({ enabled }: { enabled: boolean }) {
  if (enabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden="true" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden="true" />
      Revoked
    </span>
  );
}

// ─── Inline add-user form ────────────────────────────────────────────────────

function AddUserForm({ tenantId, onDone }: { tenantId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.createUser({ email: email.trim(), password, role: 'tenant_user', tenant_id: tenantId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users', { tenant_id: tenantId }] });
      onDone();
    },
  });

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-violet-200 bg-violet-50 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim() && password.length >= 8) mutation.mutate();
      }}
    >
      <p className="text-sm font-medium text-violet-800">Add user to this tenant</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-700">Email address</span>
          <input
            autoFocus
            type="email"
            required
            autoComplete="off"
            placeholder="user@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-slate-700">Password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </label>
      </div>
      {mutation.isError && (
        <p className="text-xs text-rose-600" role="alert">Failed to create user. Email may already be registered.</p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onDone}>Cancel</Button>
        <Button
          type="submit"
          disabled={!email.trim() || password.length < 8}
          loading={mutation.isPending}
        >
          Add user
        </Button>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [showAddUser, setShowAddUser] = useState(false);

  const tenantName = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.listTenants(),
    select: (data: TenantResponse[]) => data.find((t) => t.id === tenantId)?.name ?? tenantId,
    staleTime: 30_000,
  });

  const keysQuery = useQuery({
    queryKey: ['tenants', tenantId, 'keys'],
    queryFn: () => api.listTenantKeys(tenantId!),
    enabled: Boolean(tenantId),
  });

  const usersQuery = useQuery({
    queryKey: ['users', { tenant_id: tenantId }],
    queryFn: () => api.listUsers(tenantId),
    enabled: Boolean(tenantId),
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <Link
          to="/tenants"
          className="inline-flex items-center gap-1 text-sm text-violet-600 hover:text-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        >
          ← Back to tenants
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-bold text-violet-700"
            aria-hidden="true"
          >
            {(tenantName.data ?? '?').charAt(0).toUpperCase()}
          </span>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {tenantName.data ?? 'Tenant'}
            </h1>
            <p className="font-mono text-xs text-slate-400 select-all">{tenantId}</p>
          </div>
        </div>
      </div>

      {/* Users */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Users</CardTitle>
            {!showAddUser && (
              <Button onClick={() => setShowAddUser(true)}>
                <span className="flex items-center gap-1.5"><PlusIcon /> Add user</span>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {showAddUser && (
            <AddUserForm
              tenantId={tenantId!}
              onDone={() => setShowAddUser(false)}
            />
          )}
          {usersQuery.isLoading && (
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          )}
          {usersQuery.isError && (
            <div>
              <p className="text-sm text-rose-600" role="alert">Failed to load users.</p>
              <Button variant="secondary" className="mt-2" onClick={() => void usersQuery.refetch()}>Retry</Button>
            </div>
          )}
          {usersQuery.data?.length === 0 && !showAddUser && (
            <EmptyState
              title="No users yet"
              description="Add a user so they can access the tenant management portal."
              action={
                <Button onClick={() => setShowAddUser(true)}>
                  <span className="flex items-center gap-1.5"><PlusIcon /> Add user</span>
                </Button>
              }
              className="border-0 py-6"
            />
          )}
          {usersQuery.data && usersQuery.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">User</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Role</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usersQuery.data.map((u: UserResponse) => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600"
                            aria-hidden="true"
                          >
                            {initials(u.email)}
                          </span>
                          <span className="font-medium text-slate-900">{u.email}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                      <td className="px-4 py-3"><ActiveBadge active={u.is_active} /></td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(u.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* API Keys */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>API keys</CardTitle>
            {keysQuery.data && keysQuery.data.length > 0 && (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {keysQuery.data.length} key{keysQuery.data.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {keysQuery.isLoading && (
            <div className="space-y-2 p-4">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          )}
          {keysQuery.isError && (
            <div className="p-4">
              <p className="text-sm text-rose-600" role="alert">Failed to load API keys.</p>
              <Button variant="secondary" className="mt-2" onClick={() => void keysQuery.refetch()}>Retry</Button>
            </div>
          )}
          {keysQuery.data?.length === 0 && (
            <EmptyState
              title="No API keys"
              description="Tenant users generate and manage keys from their settings portal."
              className="border-0 py-8"
            />
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {keysQuery.data.map((k: ApiKeyResponse) => (
                    <tr key={k.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-900">{k.label || '—'}</span>
                          <span className="font-mono text-xs text-slate-400">{k.id.slice(0, 8)}…</span>
                        </div>
                      </td>
                      <td className="px-5 py-3"><KeyStatusBadge enabled={k.enabled} /></td>
                      <td className="px-5 py-3 text-slate-500">{relativeTime(k.last_used_at)}</td>
                      <td className="px-5 py-3 text-slate-500">{formatDate(k.created_at)}</td>
                      <td className="px-5 py-3 text-slate-500">{k.expires_at ? formatDate(k.expires_at) : 'Never'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
