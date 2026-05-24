import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export function AdminQueuePage() {
  const qc = useQueryClient();
  const queueQuery = useQuery({
    queryKey: ['admin', 'queue'],
    queryFn: () => api.getAdminQueue(),
  });

  const flushMutation = useMutation({
    mutationFn: (tenantId: string) => api.flushAdminQueue(tenantId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'queue'] }),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900">Ingestion Queue</h1>
      <Card>
        <CardHeader>
          <CardTitle>System total: {queueQuery.data?.total_buffered_system ?? '—'} buffered</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {queueQuery.data?.tenants.map((t) => (
            <div key={t.tenant_id} className="flex items-center justify-between border-t border-slate-100 px-4 py-3 first:border-t-0">
              <div>
                <p className="font-medium">{t.tenant_name}</p>
                <p className="text-xs text-slate-500">{t.total_buffered} buffered · trigger: {t.next_batch_trigger}</p>
              </div>
              <Button
                variant="secondary"
                disabled={flushMutation.isPending}
                onClick={() => flushMutation.mutate(t.tenant_id)}
              >
                Flush
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
