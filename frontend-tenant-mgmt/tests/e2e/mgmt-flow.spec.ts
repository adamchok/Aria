import { test, expect } from '@playwright/test';

/**
 * Tenant mgmt happy path — login → dashboard → generate API key.
 * Stubs the API so the test runs against Vite without a live backend.
 */
test('tenant mgmt login and generate API key', async ({ page }) => {
  await page.route('**/api/v1/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'e2e-token',
        token_type: 'bearer',
        user: {
          id: 'tenant-1',
          email: 'finance@acme.test',
          role: 'tenant_user',
          tenant_id: 't1',
          is_active: true,
          created_at: new Date().toISOString(),
        },
      }),
    });
  });

  await page.route('**/api/v1/analytics/summary**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tenant_id: 't1',
        period_start: '2026-04-01',
        period_end: '2026-05-01',
        total_jobs: 5,
        total_records: 100,
        matched_records: 90,
        uncertain_records: 5,
        unmatched_records: 5,
        avg_match_rate: 0.9,
        avg_processing_seconds: 30,
        escalation_rate: 0.05,
        by_corridor: [],
      }),
    });
  });

  await page.route('**/api/v1/ingest/queue', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tenant_id: 't1',
        total_buffered: 2,
        next_batch_trigger: 'none',
        by_corridor: [],
      }),
    });
  });

  let keys: { id: string; label: string; enabled: boolean }[] = [];

  await page.route('**/api/v1/tenant/keys', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(keys) });
      return;
    }
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { label?: string };
      const created = {
        id: 'key-new',
        tenant_id: 't1',
        label: body.label ?? '',
        key: 'aria_e2e_key_once',
        last_used_at: null,
        expires_at: null,
        enabled: true,
        created_at: new Date().toISOString(),
      };
      keys = [...keys, created];
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
    }
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill('finance@acme.test');
  await page.getByLabel('Password').fill('secret');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText('Completed jobs')).toBeVisible();

  await page.getByRole('link', { name: 'API Keys' }).click();
  await expect(page).toHaveURL(/\/keys/);

  await page.getByLabel('Key label').fill('E2E Key');
  await page.getByRole('button', { name: 'Generate' }).click();
  await expect(page.getByText('aria_e2e_key_once')).toBeVisible();
  await expect(page.getByText('E2E Key')).toBeVisible();
});
