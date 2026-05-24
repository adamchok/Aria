import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

export function UsersPage() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [role, setRole] = useState<'admin' | 'tenant_user'>('tenant_user');

  const tenantsQuery = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.listTenants(),
  });

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => api.listUsers(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createUser({
        email: email.trim(),
        password,
        role,
        tenant_id: role === 'tenant_user' ? tenantId : undefined,
      }),
    onSuccess: () => {
      setEmail('');
      setPassword('');
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const canSubmit =
    email.trim() &&
    password.length >= 8 &&
    (role === 'admin' || tenantId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
        <p className="mt-1 text-sm text-slate-500">Platform admins and tenant-scoped users</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Create user</CardTitle></CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) createMutation.mutate();
            }}
          >
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="font-medium text-slate-700">Email</span>
              <input
                id="user-email"
                type="email"
                required
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
            <div className="flex flex-col gap-1 text-sm sm:col-span-2">
              <label htmlFor="user-password" className="font-medium text-slate-700">
                Password
              </label>
              <input
                id="user-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-500">Minimum 8 characters</span>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'admin' | 'tenant_user')}
                className="rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="tenant_user">Tenant user</option>
                <option value="admin">Platform admin</option>
              </select>
            </label>
            {role === 'tenant_user' && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Tenant</span>
                <select
                  required
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  className="rounded border border-slate-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select tenant…</option>
                  {tenantsQuery.data?.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" disabled={!canSubmit || createMutation.isPending}>
                {createMutation.isPending ? 'Creating…' : 'Create user'}
              </Button>
            </div>
          </form>
          {createMutation.isError && (
            <p className="mt-3 text-sm text-rose-600" role="alert">
              Could not create user. The email may already be registered.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>All users</CardTitle></CardHeader>
        <CardContent className="p-0">
          {usersQuery.isLoading && (
            <p className="p-4 text-sm text-slate-500" aria-live="polite">Loading users…</p>
          )}
          {usersQuery.isError && (
            <div className="p-4">
              <p className="text-sm text-rose-600" role="alert">Failed to load users.</p>
              <Button variant="secondary" className="mt-2" onClick={() => void usersQuery.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {usersQuery.data?.length === 0 && (
            <EmptyState title="No users yet" description="Create a tenant user so they can sign in to Ops or Tenant mgmt." className="m-4 border-0" />
          )}
          {usersQuery.data?.map((u) => (
            <div
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm first:border-t-0"
            >
              <span className="font-medium text-slate-900">{u.email}</span>
              <span className="text-slate-500" aria-label={`Role: ${u.role}`}>
                {u.role === 'admin' ? 'Platform admin' : 'Tenant user'}
                {u.tenant_id ? ` · ${u.tenant_id.slice(0, 8)}…` : ''}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
