import { test, expect } from '@playwright/test';
import { loginAsTenantUser, stubTenantLogin } from './helpers';

test('tenant ops login and open upload', async ({ page }) => {
  await stubTenantLogin(page);

  await page.route('**/api/v1/jobs', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], total: 0, page: 1, page_size: 10 }),
      });
      return;
    }
    await route.continue();
  });

  await loginAsTenantUser(page);
  await expect(page.getByText('Pipeline Dashboard')).toBeVisible();

  await page.getByRole('link', { name: 'Upload' }).click();
  await expect(page).toHaveURL(/\/upload/);
  await expect(page.getByRole('heading', { name: /New reconciliation job/i })).toBeVisible();
});
