import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export function UsersPage() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [role, setRole] = useState<'admin' | 'tenant_user'>('tenant_user');

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => api.listUsers(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createUser({
        email,
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

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900">Users</h1>

      <Card>
        <CardHeader><CardTitle>Create user</CardTitle></CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded border px-3 py-2 text-sm" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="rounded border px-3 py-2 text-sm" />
          <select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'tenant_user')} className="rounded border px-3 py-2 text-sm">
            <option value="tenant_user">tenant_user</option>
            <option value="admin">admin</option>
          </select>
          {role === 'tenant_user' && (
            <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="Tenant UUID" className="rounded border px-3 py-2 text-sm" />
          )}
          <Button className="sm:col-span-2" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            Create
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {usersQuery.data?.map((u) => (
            <div key={u.id} className="flex justify-between border-t border-slate-100 px-4 py-3 text-sm first:border-t-0">
              <span>{u.email}</span>
              <span className="text-slate-500">{u.role}{u.tenant_id ? ` · ${u.tenant_id.slice(0, 8)}…` : ''}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
