import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function loginAsTenantUser(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('finance@novapay.demo');
  await page.getByLabel('Password').fill('novapay2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function seedTenantAuth(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'novapay-auth',
      JSON.stringify({
        state: { isLoggedIn: true },
        version: 0,
      }),
    );
  });
}
