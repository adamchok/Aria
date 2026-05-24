import { HttpResponse, http } from 'msw';
import {
  ACCOUNT_ID,
  KEY_ID,
  STMT_ID,
  TENANT_ID,
  WEBHOOK_ID,
  analyticsFixture,
  apiKeyFixture,
  bankAccountFixture,
  ledgerPageFixture,
  loginResponseFixture,
  queueFixture,
  statementFixture,
  tenantUserFixture,
  webhookDeliveryFixture,
  webhookFixture,
} from './fixtures';

let apiKeys = [apiKeyFixture];
let tenantUsers = [tenantUserFixture];
let webhooks = [webhookFixture];
let bankAccounts = [bankAccountFixture];

export const handlers = [
  http.post('http://localhost/api/v1/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (body.email === 'bad@acme.test') {
      return HttpResponse.json({ detail: 'Invalid email or password' }, { status: 401 });
    }
    return HttpResponse.json(loginResponseFixture);
  }),

  http.get('http://localhost/api/v1/analytics/summary', () =>
    HttpResponse.json(analyticsFixture),
  ),

  http.get('http://localhost/api/v1/ingest/queue', () => HttpResponse.json(queueFixture)),

  http.post('http://localhost/api/v1/ingest/queue/flush', () =>
    HttpResponse.json({ status: 'accepted' }, { status: 202 }),
  ),

  http.get('http://localhost/api/v1/tenant/keys', () => HttpResponse.json(apiKeys)),

  http.post('http://localhost/api/v1/tenant/keys', async ({ request }) => {
    const body = (await request.json()) as { label?: string };
    const created = {
      ...apiKeyFixture,
      id: 'new-key-id-0000-0000-000000000099',
      label: body.label ?? '',
      key: 'aria_live_test_key_shown_once_only',
    };
    apiKeys = [...apiKeys, created];
    return HttpResponse.json(created, { status: 201 });
  }),

  http.delete(`http://localhost/api/v1/tenant/keys/${KEY_ID}`, () => {
    apiKeys = apiKeys.map((k) => (k.id === KEY_ID ? { ...k, enabled: false } : k));
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('http://localhost/api/v1/tenant/users', () => HttpResponse.json(tenantUsers)),

  http.post('http://localhost/api/v1/tenant/users', async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    const created: typeof tenantUserFixture = {
      id: 'new-user-id-0000-0000-000000000099',
      email: body.email,
      role: 'tenant_user',
      tenant_id: TENANT_ID,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    tenantUsers = [...tenantUsers, created];
    return HttpResponse.json(created, { status: 201 });
  }),

  http.get('http://localhost/api/v1/webhooks', () => HttpResponse.json(webhooks)),

  http.post('http://localhost/api/v1/webhooks', async ({ request }) => {
    const body = (await request.json()) as { url: string; events: string[]; label?: string };
    const created = {
      ...webhookFixture,
      id: 'new-webhook-id-0000-000000000099',
      url: body.url,
      events: body.events,
      label: body.label ?? '',
      secret: 'whsec_test_secret_shown_once',
    };
    webhooks = [...webhooks, created];
    return HttpResponse.json(created, { status: 201 });
  }),

  http.delete(`http://localhost/api/v1/webhooks/${WEBHOOK_ID}`, () => {
    webhooks = webhooks.filter((w) => w.id !== WEBHOOK_ID);
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`http://localhost/api/v1/webhooks/${WEBHOOK_ID}/test`, () =>
    HttpResponse.json({ queued: true }, { status: 202 }),
  ),

  http.get(`http://localhost/api/v1/webhooks/${WEBHOOK_ID}/deliveries`, () =>
    HttpResponse.json([webhookDeliveryFixture]),
  ),

  http.get('http://localhost/api/v1/bank-accounts', () => HttpResponse.json(bankAccounts)),

  http.post('http://localhost/api/v1/bank-accounts', async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      bank_name: string;
      account_number_masked: string;
      currency: string;
    };
    const created = {
      ...bankAccountFixture,
      id: 'new-account-id-0000-000000000099',
      name: body.name,
      bank_name: body.bank_name,
      account_number_masked: body.account_number_masked,
      currency: body.currency,
      statement_count: 0,
      entry_count: 0,
      uncleared_count: 0,
    };
    bankAccounts = [...bankAccounts, created];
    return HttpResponse.json(created, { status: 201 });
  }),

  http.get(`http://localhost/api/v1/bank-accounts/${ACCOUNT_ID}`, () =>
    HttpResponse.json(bankAccountFixture),
  ),

  http.delete(`http://localhost/api/v1/bank-accounts/${ACCOUNT_ID}`, () => {
    bankAccounts = bankAccounts.filter((a) => a.id !== ACCOUNT_ID);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`http://localhost/api/v1/bank-accounts/${ACCOUNT_ID}/statements`, () =>
    HttpResponse.json([statementFixture]),
  ),

  http.post(`http://localhost/api/v1/bank-accounts/${ACCOUNT_ID}/statements`, () =>
    HttpResponse.json(
      {
        id: STMT_ID,
        filename: 'new.csv',
        entry_count: 2,
        account_id: ACCOUNT_ID,
        statement_period_start: '2026-05-01',
        statement_period_end: '2026-05-31',
      },
      { status: 201 },
    ),
  ),

  http.get(`http://localhost/api/v1/bank-accounts/${ACCOUNT_ID}/ledger`, () =>
    HttpResponse.json(ledgerPageFixture),
  ),
];

export function resetHandlerState() {
  apiKeys = [apiKeyFixture];
  tenantUsers = [tenantUserFixture];
  webhooks = [webhookFixture];
  bankAccounts = [bankAccountFixture];
}
