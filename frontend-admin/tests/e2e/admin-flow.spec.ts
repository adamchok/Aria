import { test, expect } from '@playwright/test';

/**
 * Admin happy path — login → tenants list → create tenant.
 * Stubs the API so the test runs against Vite without a live backend.
 */
test('admin login and create tenant', async ({ page }) => {
  await page.route('**/api/v1/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'e2e-token',
        token_type: 'bearer',
        user: {
          id: 'admin-1',
          email: 'admin@aria.local',
          role: 'admin',
          tenant_id: null,
          is_active: true,
          created_at: new Date().toISOString(),
        },
      }),
    });
  });

  let tenants = [{ id: 't1', name: 'Acme Corp', created_at: new Date().toISOString() }];

  await page.route('**/api/v1/tenants', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tenants) });
      return;
    }
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as { name: string };
      const created = { id: 't-new', name: body.name, created_at: new Date().toISOString() };
      tenants = [...tenants, created];
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(created) });
    }
  });

  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@aria.local');
  await page.getByLabel('Password').fill('secret');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/tenants/);
  await expect(page.getByText('Acme Corp')).toBeVisible();

  await page.getByLabel('Tenant name').fill('Gamma Inc');
  await page.getByRole('button', { name: 'Create tenant' }).click();
  await expect(page.getByText('Gamma Inc')).toBeVisible();
});
