import { HttpResponse, http } from 'msw';
import {
  ACCOUNT_ID,
  JOB_ID,
  bankAccountFixture,
  jobCreateResponse,
  jobStatusCompleted,
  ledgerPageFixture,
  reportFixture,
  statementFixture,
  uncertainItem,
} from './fixtures';
import type { BankAccountResponse, ReviewActionRequest, ReviewActionResponse } from '@/types/api';

export const handlers = [
  http.post('http://localhost/api/v1/jobs', () => HttpResponse.json(jobCreateResponse, { status: 201 })),
  http.get(`http://localhost/api/v1/jobs/${JOB_ID}`, () => HttpResponse.json(jobStatusCompleted)),
  http.get(`http://localhost/api/v1/jobs/${JOB_ID}/results`, () => HttpResponse.json(reportFixture)),
  http.get(`http://localhost/api/v1/jobs/${JOB_ID}/review`, () => HttpResponse.json([uncertainItem])),
  http.post(
    `http://localhost/api/v1/jobs/${JOB_ID}/review/:matchId`,
    async ({ params, request }) => {
      const body = (await request.json()) as ReviewActionRequest;
      const resp: ReviewActionResponse = {
        match_id: String(params.matchId),
        status: body.action === 'reject' ? 'UNMATCHED' : 'MATCHED',
        human_reviewed: true,
        note: body.note ?? null,
      };
      return HttpResponse.json(resp);
    },
  ),

  // Bank accounts
  http.get('http://localhost/api/v1/bank-accounts', () =>
    HttpResponse.json([bankAccountFixture]),
  ),
  http.post('http://localhost/api/v1/bank-accounts', async ({ request }) => {
    const body = (await request.json()) as BankAccountResponse;
    return HttpResponse.json({ ...bankAccountFixture, ...body }, { status: 201 });
  }),
  http.get(`http://localhost/api/v1/bank-accounts/${ACCOUNT_ID}`, () =>
    HttpResponse.json(bankAccountFixture),
  ),
  http.delete(`http://localhost/api/v1/bank-accounts/${ACCOUNT_ID}`, () =>
    new HttpResponse(null, { status: 204 }),
  ),
  http.get(`http://localhost/api/v1/bank-accounts/${ACCOUNT_ID}/statements`, () =>
    HttpResponse.json([statementFixture]),
  ),
  http.post(`http://localhost/api/v1/bank-accounts/${ACCOUNT_ID}/statements`, () =>
    HttpResponse.json(
      { id: statementFixture.id, filename: 'new.csv', entry_count: 2, account_id: ACCOUNT_ID,
        statement_period_start: null, statement_period_end: null },
      { status: 201 },
    ),
  ),
  http.get(`http://localhost/api/v1/bank-accounts/${ACCOUNT_ID}/ledger`, () =>
    HttpResponse.json(ledgerPageFixture),
  ),
];
