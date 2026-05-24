import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw-server';
import { ApiError, api } from '@/api/client';
import { useAuthStore } from '@/stores/auth-store';
import {
  TENANT_ID,
  adminAnalyticsFixture,
  adminQueueFixture,
  adminUserFixture,
  loginResponseFixture,
  tenantFixture,
} from '@/test/fixtures';

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', adminUserFixture);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('api client', () => {
  it('login returns token and user', async () => {
    useAuthStore.getState().clear();
    const result = await api.login('admin@aria.local', 'secret');
    expect(result.access_token).toBe(loginResponseFixture.access_token);
    expect(result.user.role).toBe('admin');
  });

  it('listTenants and createTenant parse responses', async () => {
    const tenants = await api.listTenants();
    expect(tenants).toHaveLength(2);
    expect(tenants[0]?.name).toBe(tenantFixture.name);

    const created = await api.createTenant('New Co');
    expect(created.name).toBe('New Co');
  });

  it('getAdminAnalytics and getAdminQueue parse responses', async () => {
    expect((await api.getAdminAnalytics()).total_jobs).toBe(adminAnalyticsFixture.total_jobs);
    expect((await api.getAdminQueue()).total_buffered_system).toBe(adminQueueFixture.total_buffered_system);
  });

  it('flushAdminQueue POSTs to tenant flush endpoint', async () => {
    let path = '';
    server.use(
      http.post(`http://localhost/api/v1/ingest/admin/queue/flush/${TENANT_ID}`, ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ status: 'accepted' }, { status: 202 });
      }),
    );
    await api.flushAdminQueue(TENANT_ID);
    expect(path).toContain(TENANT_ID);
  });

  it('throws ApiError on non-OK responses', async () => {
    server.use(
      http.get('http://localhost/api/v1/tenants', () =>
        HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }),
      ),
    );
    await expect(api.listTenants()).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
    });
    expect(ApiError).toBeDefined();
  });
});
