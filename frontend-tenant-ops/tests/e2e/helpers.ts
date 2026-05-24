import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

const TENANT_USER = {
  id: 'tenant-1',
  email: 'finance@acme.test',
  role: 'tenant_user',
  tenant_id: 't1',
  is_active: true,
  created_at: new Date().toISOString(),
};

export async function stubTenantLogin(page: Page) {
  await page.route('**/api/v1/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'e2e-token',
        token_type: 'bearer',
        user: TENANT_USER,
      }),
    });
  });
}

export async function loginAsTenantUser(page: Page) {
  await stubTenantLogin(page);
  await page.goto('/login');
  await page.getByLabel('Email').fill('finance@acme.test');
  await page.getByLabel('Password').fill('secret');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function seedTenantAuth(page: Page) {
  await page.addInitScript((user) => {
    localStorage.setItem(
      'aria-auth',
      JSON.stringify({
        state: { accessToken: 'e2e-token', user },
        version: 0,
      }),
    );
  }, TENANT_USER);
}
