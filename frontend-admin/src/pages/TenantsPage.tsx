import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export function TenantsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');

  const tenantsQuery = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.listTenants(),
  });

  const createMutation = useMutation({
    mutationFn: () => api.createTenant(name),
    onSuccess: () => {
      setName('');
      void qc.invalidateQueries({ queryKey: ['tenants'] });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Tenants</h1>
        <p className="mt-1 text-sm text-slate-500">Platform tenants</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Create tenant</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tenant name"
            className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm"
          />
          <Button onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending}>
            Create
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {tenantsQuery.data?.map((t) => (
            <div key={t.id} className="flex items-center justify-between border-t border-slate-100 px-4 py-3 first:border-t-0">
              <div>
                <p className="font-medium text-slate-900">{t.name}</p>
                <p className="text-xs font-mono text-slate-500">{t.id}</p>
              </div>
              <Link to={`/tenants/${t.id}`} className="text-sm text-blue-600">View</Link>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
