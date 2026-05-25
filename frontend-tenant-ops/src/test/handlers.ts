import { HttpResponse, http } from 'msw';
import {
  ACCOUNT_ID,
  JOB_ID,
  bankAccountFixture,
  bankEntryPickerFixture,
  jobCreateResponse,
  jobListItemFixture,
  jobStatusCompleted,
  ledgerPageFixture,
  loginResponseFixture,
  reportFixture,
  statementFixture,
  uncertainItem,
} from './fixtures';
import type { BankAccountResponse, JobListItem, ReviewActionRequest, ReviewActionResponse } from '@/types/api';

let jobListItems: JobListItem[] = [jobListItemFixture];

export const handlers = [
  http.post('http://localhost/api/v1/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    if (body.email === 'bad@acme.test') {
      return HttpResponse.json({ detail: 'Invalid email or password' }, { status: 401 });
    }
    return HttpResponse.json(loginResponseFixture);
  }),

  http.get('http://localhost/api/v1/jobs', ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const page = Number(url.searchParams.get('page') ?? '1');
    const pageSize = Number(url.searchParams.get('page_size') ?? '20');
    const filtered = status
      ? jobListItems.filter((j) => j.status === status)
      : jobListItems;
    return HttpResponse.json({
      items: filtered.slice((page - 1) * pageSize, page * pageSize),
      total: filtered.length,
      page,
      page_size: pageSize,
    });
  }),

  http.post('http://localhost/api/v1/jobs', () => HttpResponse.json(jobCreateResponse, { status: 201 })),
  http.get(`http://localhost/api/v1/jobs/${JOB_ID}`, () => HttpResponse.json(jobStatusCompleted)),
  http.get(`http://localhost/api/v1/jobs/${JOB_ID}/results`, () => HttpResponse.json(reportFixture)),
  http.get(`http://localhost/api/v1/jobs/${JOB_ID}/review`, () => HttpResponse.json([uncertainItem])),
  http.get(`http://localhost/api/v1/jobs/${JOB_ID}/bank-entries`, () =>
    HttpResponse.json(bankEntryPickerFixture),
  ),
  http.post(
    `http://localhost/api/v1/jobs/${JOB_ID}/review/:matchId`,
    async ({ params, request }) => {
      const body = (await request.json()) as ReviewActionRequest;
      const resp: ReviewActionResponse = {
        match_id: String(params.matchId),
        status: body.action === 'reject' ? 'UNMATCHED' : 'MATCHED',
        human_reviewed: true,
        note: body.note ?? null,
        bank_entry:
          body.action === 'manual_match' && body.bank_entry_id
            ? bankEntryPickerFixture.find((e) => e.id === body.bank_entry_id) ?? null
            : null,
      };
      return HttpResponse.json(resp);
    },
  ),

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
      {
        id: statementFixture.id,
        filename: 'new.csv',
        entry_count: 2,
        account_id: ACCOUNT_ID,
        statement_period_start: null,
        statement_period_end: null,
      },
      { status: 201 },
    ),
  ),
  http.get(`http://localhost/api/v1/bank-accounts/${ACCOUNT_ID}/ledger`, () =>
    HttpResponse.json(ledgerPageFixture),
  ),
];

export function resetHandlerState() {
  jobListItems = [jobListItemFixture];
}
