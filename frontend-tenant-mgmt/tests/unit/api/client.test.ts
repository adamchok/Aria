import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw-server';
import { ApiError, api } from '@/api/client';
import { useAuthStore } from '@/stores/auth-store';
import {
  ACCOUNT_ID,
  KEY_ID,
  analyticsFixture,
  loginResponseFixture,
  queueFixture,
  tenantUserFixture,
} from '@/test/fixtures';

beforeEach(() => {
  useAuthStore.getState().setAuth('test-token', tenantUserFixture);
});

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('api client', () => {
  it('login returns token and tenant user', async () => {
    useAuthStore.getState().clear();
    const result = await api.login('finance@acme.test', 'secret');
    expect(result.access_token).toBe(loginResponseFixture.access_token);
    expect(result.user.role).toBe('tenant_user');
  });

  it('getAnalytics and getQueueStatus parse responses', async () => {
    expect((await api.getAnalytics()).total_jobs).toBe(analyticsFixture.total_jobs);
    expect((await api.getQueueStatus()).total_buffered).toBe(queueFixture.total_buffered);
  });

  it('listTenantKeys and createTenantKey parse responses', async () => {
    const keys = await api.listTenantKeys();
    expect(keys[0]?.label).toBe('Production');

    const created = await api.createTenantKey('Test');
    expect(created.label).toBe('Test');
  });

  it('flushQueue POSTs to ingest flush endpoint', async () => {
    let path = '';
    server.use(
      http.post('http://localhost/api/v1/ingest/queue/flush', ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ status: 'accepted' }, { status: 202 });
      }),
    );
    await api.flushQueue();
    expect(path).toContain('/ingest/queue/flush');
  });

  it('getAccountLedger includes account id in path', async () => {
    const ledger = await api.getAccountLedger(ACCOUNT_ID);
    expect(ledger.items).toHaveLength(1);
  });

  it('throws ApiError on non-OK responses', async () => {
    server.use(
      http.get('http://localhost/api/v1/tenant/keys', () =>
        HttpResponse.json({ detail: 'Forbidden' }, { status: 403 }),
      ),
    );
    await expect(api.listTenantKeys()).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
    });
    expect(ApiError).toBeDefined();
  });

  it('revokeTenantKey DELETEs key by id', async () => {
    await expect(api.revokeTenantKey(KEY_ID)).resolves.toBeUndefined();
  });
});
