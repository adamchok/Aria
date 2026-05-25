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

  const usersQuery = useQuery({
    queryKey: ['tenant', 'users'],
    queryFn: () => api.listTenantUsers(),
  });

  const createMutation = useMutation({
    mutationFn: () => api.createTenantUser(email.trim(), password),
    onSuccess: () => {
      setEmail('');
      setPassword('');
      void qc.invalidateQueries({ queryKey: ['tenant', 'users'] });
    },
  });

  const canSubmit = email.trim().length >= 3 && password.length >= 8;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
        <p className="mt-1 text-sm text-slate-500">Invite team members to access your account</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invite user</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) createMutation.mutate();
            }}
          >
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Email</span>
              <input
                type="email"
                required
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </label>
            <div className="flex flex-1 flex-col gap-1 text-sm">
              <label htmlFor="invite-password" className="font-medium text-slate-700">
                Password
              </label>
              <input
                id="invite-password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded border border-slate-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <span className="text-xs text-slate-500">Minimum 8 characters</span>
            </div>
            <Button type="submit" disabled={!canSubmit || createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create user'}
            </Button>
          </form>
          {createMutation.isError && (
            <p className="mt-3 text-sm text-rose-600" role="alert">
              Could not create user. The email may already be registered.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team members</CardTitle>
        </CardHeader>
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
            <EmptyState
              title="No users yet"
              description="Invite a user so they can sign in to Ops or this management app."
              className="m-4 border-0"
            />
          )}
          {usersQuery.data && usersQuery.data.length > 0 && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-2 font-medium text-slate-500">Email</th>
                  <th className="px-4 py-2 font-medium text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {usersQuery.data.map((u) => (
                  <tr key={u.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{u.email}</td>
                    <td className="px-4 py-3">{u.is_active ? 'Active' : 'Inactive'}</td>
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
