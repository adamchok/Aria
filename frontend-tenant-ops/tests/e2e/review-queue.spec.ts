import { test, expect } from '@playwright/test';
import { seedTenantAuth } from './helpers';

/**
 * Review-queue happy path — open an UNCERTAIN match, confirm it,
 * verify it disappears from the queue. Backend stubbed via page.route.
 */
test('confirm uncertain match removes it from the queue', async ({ page }) => {
  const JOB_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const MATCH_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

  let confirmed = false;

  await page.route(`**/api/v1/jobs/${JOB_ID}/review`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        confirmed
          ? []
          : [
              {
                id: MATCH_ID,
                normalised_record: {
                  payment: {
                    id: 'p',
                    payer: 'Acme US Inc',
                    payee: 'ARIA',
                    amount_original: '1000.00',
                    currency: 'USD',
                    value_date: '2026-05-18',
                    reference: 'INV-001',
                    bank_charges: null,
                    source_format: 'IMAGE',
                    extraction_confidence: 0.95,
                    raw_extracted_text: '',
                    field_confidences: {},
                    source_document: null,
                  },
                  amount_myr_at_invoice_rate: '4230.00',
                  amount_myr_at_settlement_rate: '4230.00',
                  fx_rate_invoice: '4.230',
                  fx_rate_settlement: '4.230',
                  tolerance_low: '4115.79',
                  tolerance_high: '4293.45',
                  estimated_charges_myr: '50.76',
                  base_currency: 'MYR',
                },
                bank_entry: {
                  id: 'b',
                  value_date: '2026-05-20',
                  amount: '4179.24',
                  currency: 'MYR',
                  description: 'TT',
                  reference: 'INV-001',
                  counterparty: 'ACME',
                },
                candidate_scores: [],
                confidence: 0.62,
                status: 'UNCERTAIN',
                amount_variance_myr: '-50.76',
                variance_explanation: 'Within tolerance — payer name match weak.',
                reasoning_chain: '',
                human_reviewed: false,
                review_notes: null,
              },
            ],
      ),
    }),
  );

  await page.route(`**/api/v1/jobs/${JOB_ID}/review/${MATCH_ID}`, (route) => {
    confirmed = true;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        match_id: MATCH_ID,
        status: 'MATCHED',
        human_reviewed: true,
        note: null,
      }),
    });
  });

  await seedTenantAuth(page);
  await page.goto(`/jobs/${JOB_ID}/review`);
  await expect(page.getByRole('heading', { name: /Human review queue/i })).toBeVisible();
  await expect(page.getByText('Acme US Inc')).toBeVisible();

  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: /Confirm match/i }).click();

  await expect(page.getByText(/No uncertain items/i)).toBeVisible();
});
