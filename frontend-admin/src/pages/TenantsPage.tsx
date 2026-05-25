import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';

export function TenantsPage() {
  const qc = useQueryClient();
  const [name, setName] = useState('');

  const tenantsQuery = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.listTenants(),
  });

  const createMutation = useMutation({
    mutationFn: () => api.createTenant(name.trim()),
    onSuccess: () => {
      setName('');
      void qc.invalidateQueries({ queryKey: ['tenants'] });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Tenants</h1>
        <p className="mt-1 text-sm text-slate-500">Create and manage platform tenants</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Create tenant</CardTitle></CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) createMutation.mutate();
            }}
          >
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">Tenant name</span>
              <input
                id="tenant-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Corp"
                className="rounded border border-slate-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </label>
            <Button type="submit" disabled={!name.trim() || createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create tenant'}
            </Button>
          </form>
          {createMutation.isError && (
            <p className="mt-2 text-sm text-rose-600" role="alert">
              Could not create tenant. Check the name and try again.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>All tenants</CardTitle></CardHeader>
        <CardContent className="p-0">
          {tenantsQuery.isLoading && (
            <p className="p-4 text-sm text-slate-500" aria-live="polite">Loading tenants…</p>
          )}
          {tenantsQuery.isError && (
            <div className="p-4">
              <p className="text-sm text-rose-600" role="alert">Failed to load tenants.</p>
              <Button variant="secondary" className="mt-2" onClick={() => void tenantsQuery.refetch()}>
                Retry
              </Button>
            </div>
          )}
          {tenantsQuery.data?.length === 0 && (
            <EmptyState
              title="No tenants yet"
              description="Create your first tenant above to onboard a finance team."
              className="m-4 border-0"
            />
          )}
          {tenantsQuery.data?.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 border-t border-slate-100 px-4 py-3 hover:bg-slate-50 transition-colors first:border-t-0"
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700"
                aria-hidden="true"
              >
                {t.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{t.name}</p>
                <p className="text-xs font-mono text-slate-500">{t.id}</p>
              </div>
              <Link
                to={`/tenants/${t.id}`}
                className="shrink-0 rounded text-sm text-violet-600 hover:text-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              >
                View details
              </Link>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
