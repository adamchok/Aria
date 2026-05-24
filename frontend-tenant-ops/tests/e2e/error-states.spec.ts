import { test, expect } from '@playwright/test';
import { seedTenantAuth } from './helpers';

test('invalid file type surfaces an inline error', async ({ page }) => {
  await seedTenantAuth(page);
  await page.goto('/upload');
  await page
    .getByLabel(/Drop payment proofs file input/i)
    .setInputFiles({ name: 'virus.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('x') });
  await expect(page.getByRole('alert')).toContainText(/Unsupported file type/i);
});

test('failed job status is shown with retry CTA', async ({ page }) => {
  const JOB_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  await seedTenantAuth(page);
  await page.route(`**/api/v1/jobs/${JOB_ID}`, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'pipeline crashed' }),
    }),
  );

  await page.goto(`/jobs/${JOB_ID}`);
  await expect(page.getByRole('alert')).toContainText(/pipeline crashed/i);
  await expect(page.getByRole('button', { name: /Retry/i })).toBeEnabled();
});
