import { test, expect } from '@playwright/test';

/**
 * Happy path — upload → wait → view results → confirm export link.
 *
 * Routes a stubbed backend via Playwright `page.route` so the test runs
 * against a live Vite server without needing FastAPI + Postgres + MinIO.
 * Spec section 5.4 (e2e file matrix).
 */
test('upload → results → export', async ({ page }) => {
  const JOB_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  await page.route('**/api/v1/jobs', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: JOB_ID,
        status: 'PENDING',
        created_at: new Date().toISOString(),
      }),
    });
  });

  await page.route(`**/api/v1/jobs/${JOB_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: JOB_ID,
        status: 'COMPLETED',
        progress_pct: 100,
        agents_completed: ['ingestion', 'normalisation', 'matching', 'report'],
        error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    }),
  );

  await page.route(`**/api/v1/jobs/${JOB_ID}/results`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job_id: JOB_ID,
        base_currency: 'MYR',
        generated_at: new Date().toISOString(),
        narrative: 'ARIA reconciled 1 of 1 records with high confidence.',
        summary: {
          total_records: 1,
          matched_count: 1,
          uncertain_count: 0,
          unmatched_count: 0,
          total_value_myr: '4230.00',
          matched_value_myr: '4230.00',
          total_variance_myr: '0',
          processing_seconds: 12.4,
        },
        matches: [],
      }),
    }),
  );

  await page.goto('/upload');
  await expect(page.getByRole('heading', { name: /New reconciliation job/i })).toBeVisible();

  // Upload a payment proof.
  await page
    .getByLabel(/Drop payment proofs file input/i)
    .setInputFiles({ name: 'usd.png', mimeType: 'image/png', buffer: Buffer.from('proof') });
  // Upload a bank statement.
  await page
    .getByLabel(/Drop bank statement file input/i)
    .setInputFiles({ name: 'may.csv', mimeType: 'text/csv', buffer: Buffer.from('Date,Amount\n2026-05-20,42.30\n') });

  await page.getByRole('button', { name: /Start reconciliation/i }).click();

  await expect(page.getByText(/Reconciliation results/i)).toBeVisible();
  await expect(page.getByText(/ARIA reconciled 1 of 1 records/i)).toBeVisible();

  const exportLink = page.getByRole('link', { name: /Export Excel/i });
  await expect(exportLink).toBeVisible();
  await expect(exportLink).toHaveAttribute('href', new RegExp(`/api/v1/jobs/${JOB_ID}/export$`));
});
