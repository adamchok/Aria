import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

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
        <Link
          to="/tenants"
          className="text-sm text-blue-600 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          ← Back to tenants
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Tenant detail</h1>
        <p className="mt-1 font-mono text-sm text-slate-500">{tenantId}</p>
      </div>

      <Card>
        <CardHeader><CardTitle>API keys</CardTitle></CardHeader>
        <CardContent>
          {keysQuery.isLoading && <p className="text-sm text-slate-500">Loading keys…</p>}
          {keysQuery.isError && (
            <div>
              <p className="text-sm text-rose-600" role="alert">Failed to load API keys.</p>
              <Button variant="secondary" className="mt-2" onClick={() => void keysQuery.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {keysQuery.data?.length === 0 && (
            <EmptyState
              title="No API keys"
              description="Tenant users can generate keys from the Tenant mgmt app."
              className="border-0 py-6"
            />
          )}
          <ul className="text-sm">
            {keysQuery.data?.map((k) => (
              <li key={k.id} className="flex justify-between border-t border-slate-100 py-2 first:border-t-0">
                <span>{k.label || k.id.slice(0, 8)}</span>
                <span
                  className={k.enabled ? 'text-emerald-700' : 'text-slate-500'}
                  aria-label={k.enabled ? 'Active' : 'Revoked'}
                >
                  {k.enabled ? 'Active' : 'Revoked'}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Users</CardTitle></CardHeader>
        <CardContent>
          {usersQuery.isLoading && <p className="text-sm text-slate-500">Loading users…</p>}
          {usersQuery.data?.length === 0 && (
            <EmptyState title="No users for this tenant" description="Create a tenant user from the Users page." className="border-0 py-6" />
          )}
          {usersQuery.data?.map((u) => (
            <div key={u.id} className="border-t border-slate-100 py-2 text-sm first:border-t-0">
              {u.email} <span className="text-slate-500">({u.role === 'admin' ? 'Platform admin' : 'Tenant user'})</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
