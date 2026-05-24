import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export function TenantDetailPage() {
  const { tenantId } = useParams<{ tenantId: string }>();

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
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Tenant detail</h1>
        <p className="mt-1 font-mono text-sm text-slate-500">{tenantId}</p>
      </div>

      <Card>
        <CardHeader><CardTitle>API keys (read-only)</CardTitle></CardHeader>
        <CardContent>
          {keysQuery.data?.length === 0 && <p className="text-sm text-slate-500">No keys.</p>}
          <ul className="text-sm">
            {keysQuery.data?.map((k) => (
              <li key={k.id} className="border-t border-slate-100 py-2 first:border-t-0">
                {k.label || k.id.slice(0, 8)} — {k.enabled ? 'Active' : 'Revoked'}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Users</CardTitle></CardHeader>
        <CardContent>
          {usersQuery.data?.map((u) => (
            <div key={u.id} className="border-t border-slate-100 py-2 text-sm first:border-t-0">
              {u.email} ({u.role})
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
