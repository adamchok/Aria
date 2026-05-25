import { HttpResponse, http } from 'msw';
import {
  TENANT_ID,
  TENANT_ID_2,
  adminAnalyticsFixture,
  adminQueueFixture,
  adminUserFixture,
  apiKeyFixture,
  loginResponseFixture,
  tenantFixture,
  tenantFixture2,
  tenantUserFixture,
} from './fixtures';

let tenants = [tenantFixture, tenantFixture2];
let users = [adminUserFixture, tenantUserFixture];

export const handlers = [
  http.post('http://localhost/api/v1/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (body.email === 'bad@aria.local') {
      return HttpResponse.json({ detail: 'Invalid email or password' }, { status: 401 });
    }
    return HttpResponse.json(loginResponseFixture);
  }),

  http.get('http://localhost/api/v1/auth/me', () => HttpResponse.json(adminUserFixture)),

  http.get('http://localhost/api/v1/tenants', () => HttpResponse.json(tenants)),

  http.post('http://localhost/api/v1/tenants', async ({ request }) => {
    const body = (await request.json()) as { name: string };
    const created = {
      id: 'new-tenant-id-0000-0000-000000000099',
      name: body.name,
      created_at: new Date().toISOString(),
    };
    tenants = [...tenants, created];
    return HttpResponse.json(created, { status: 201 });
  }),

  http.get(`http://localhost/api/v1/tenants/${TENANT_ID}/keys`, () =>
    HttpResponse.json([apiKeyFixture]),
  ),

  http.get(`http://localhost/api/v1/tenants/${TENANT_ID_2}/keys`, () => HttpResponse.json([])),

  http.get('http://localhost/api/v1/users', ({ request }) => {
    const url = new URL(request.url);
    const tenantId = url.searchParams.get('tenant_id');
    if (tenantId === TENANT_ID) {
      return HttpResponse.json(users.filter((u) => u.tenant_id === TENANT_ID));
    }
    return HttpResponse.json(users);
  }),

  http.post('http://localhost/api/v1/users', async ({ request }) => {
    const body = (await request.json()) as {
      email: string;
      role: string;
      tenant_id?: string;
    };
    const created = {
      id: 'new-user-id-0000-0000-000000000099',
      email: body.email,
      role: body.role as 'admin' | 'tenant_user',
      tenant_id: body.tenant_id ?? null,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    users = [...users, created];
    return HttpResponse.json(created, { status: 201 });
  }),

  http.get('http://localhost/api/v1/analytics/admin/summary', () =>
    HttpResponse.json(adminAnalyticsFixture),
  ),

  http.get('http://localhost/api/v1/ingest/admin/queue', () =>
    HttpResponse.json(adminQueueFixture),
  ),

  http.post(`http://localhost/api/v1/ingest/admin/queue/flush/${TENANT_ID}`, () =>
    HttpResponse.json({ status: 'accepted' }, { status: 202 }),
  ),

  http.post(`http://localhost/api/v1/ingest/admin/queue/flush/${TENANT_ID_2}`, () =>
    HttpResponse.json({ status: 'accepted' }, { status: 202 }),
  ),
];

/** Reset mutable handler state between tests when needed. */
export function resetHandlerState() {
  tenants = [tenantFixture, tenantFixture2];
  users = [adminUserFixture, tenantUserFixture];
}
