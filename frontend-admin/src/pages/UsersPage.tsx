import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import type { TenantResponse, UserResponse } from '@/types/api';

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

function initials(email: string): string {
  const local = email.split('@')[0] ?? '';
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

// ─── Badges ───────────────────────────────────────────────────────────────────

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

// ─── Create-user modal ────────────────────────────────────────────────────────

function CreateUserModal({
  tenants,
  onClose,
}: {
  tenants: TenantResponse[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [role, setRole] = useState<'admin' | 'tenant_user'>('tenant_user');

  const mutation = useMutation({
    mutationFn: () =>
      api.createUser({
        email: email.trim(),
        password,
        role,
        tenant_id: role === 'tenant_user' ? tenantId : undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
  });

  const canSubmit = email.trim() && password.length >= 8 && (role === 'admin' || tenantId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-user-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 id="create-user-title" className="text-base font-semibold text-slate-900">Create user</h2>
          <p className="mt-0.5 text-sm text-slate-500">Add a new platform admin or tenant user.</p>
        </div>

        <form
          className="flex flex-col gap-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) mutation.mutate();
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Email address</span>
            <input
              autoFocus
              type="email"
              required
              autoComplete="off"
              placeholder="user@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Password</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
            <span className="text-xs text-slate-400">Minimum 8 characters</span>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-slate-700">Role</span>
            <select
              value={role}
              onChange={(e) => { setRole(e.target.value as 'admin' | 'tenant_user'); setTenantId(''); }}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            >
              <option value="tenant_user">Tenant user</option>
              <option value="admin">Platform admin</option>
            </select>
          </label>

          {role === 'tenant_user' && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-slate-700">Tenant</span>
              <select
                required
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              >
                <option value="">Select tenant…</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
          )}

          {mutation.isError && (
            <p className="text-sm text-rose-600" role="alert">
              Could not create user. Email may already be registered.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!canSubmit} loading={mutation.isPending}>
              Create user
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function UsersPage() {
  const [showModal, setShowModal] = useState(false);

  const tenantsQuery = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.listTenants(),
  });

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => api.listUsers(),
  });

  const tenantMap = new Map<string, string>(
    tenantsQuery.data?.map((t: TenantResponse) => [t.id, t.name]) ?? [],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
          <p className="mt-1 text-sm text-slate-500">
            Platform admins and tenant-scoped accounts
            {usersQuery.data && (
              <span className="ml-2 inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200">
                {usersQuery.data.length} total
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => setShowModal(true)}>
          <span className="flex items-center gap-1.5"><PlusIcon /> Add user</span>
        </Button>
      </div>

      {/* Users table */}
      <Card>
        <CardHeader><CardTitle>All users</CardTitle></CardHeader>
        <CardContent className="p-0">
          {usersQuery.isLoading && (
            <div className="space-y-3 p-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          )}
          {usersQuery.isError && (
            <div className="p-4">
              <p className="text-sm text-rose-600" role="alert">Failed to load users.</p>
              <Button variant="secondary" className="mt-2" onClick={() => void usersQuery.refetch()}>Retry</Button>
            </div>
          )}
          {usersQuery.data?.length === 0 && (
            <EmptyState
              title="No users yet"
              description="Create users so they can access the platform or tenant portals."
              action={
                <Button onClick={() => setShowModal(true)}>
                  <span className="flex items-center gap-1.5"><PlusIcon /> Add user</span>
                </Button>
              }
              className="m-4 border-0"
            />
          )}
          {usersQuery.data && usersQuery.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">User</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Role</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Tenant</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usersQuery.data.map((u: UserResponse) => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700"
                            aria-hidden="true"
                          >
                            {initials(u.email)}
                          </span>
                          <span className="font-medium text-slate-900">{u.email}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4"><RoleBadge role={u.role} /></td>
                      <td className="px-5 py-4">
                        {u.tenant_id ? (
                          <div className="flex flex-col">
                            <span className="text-slate-900">{tenantMap.get(u.tenant_id) ?? 'Unknown'}</span>
                            <span className="font-mono text-xs text-slate-400">{u.tenant_id.slice(0, 8)}…</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4"><ActiveBadge active={u.is_active} /></td>
                      <td className="px-5 py-4 text-slate-500">{formatDate(u.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showModal && (
        <CreateUserModal
          tenants={tenantsQuery.data ?? []}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
