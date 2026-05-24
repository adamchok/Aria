import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export function UsersPage() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const usersQuery = useQuery({
    queryKey: ['tenant', 'users'],
    queryFn: () => api.listTenantUsers(),
  });

  const createMutation = useMutation({
    mutationFn: () => api.createTenantUser(email, password),
    onSuccess: () => {
      setEmail('');
      setPassword('');
      void qc.invalidateQueries({ queryKey: ['tenant', 'users'] });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Users</h1>
        <p className="mt-1 text-sm text-slate-500">Invite tenant users for ops and mgmt apps</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invite user</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            type="password"
            placeholder="Password (min 8 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || email.length < 3 || password.length < 8}
          >
            Create user
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tenant users</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {usersQuery.isLoading && <p className="p-4 text-sm text-slate-500">Loading…</p>}
          {usersQuery.isError && <p className="p-4 text-sm text-rose-600">Failed to load users.</p>}
          {usersQuery.data && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-2 font-medium text-slate-500">Email</th>
                  <th className="px-4 py-2 font-medium text-slate-500">Role</th>
                  <th className="px-4 py-2 font-medium text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {usersQuery.data.map((u) => (
                  <tr key={u.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">{u.email}</td>
                    <td className="px-4 py-3">{u.role}</td>
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
