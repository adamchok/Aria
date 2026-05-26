import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw-server';
import { ApiError, api } from '@/api/client';
import {
  JOB_ID,
  jobCreateResponse,
  jobListFixture,
  reportFixture,
  tenantUserFixture,
  uncertainItem,
} from '@/test/fixtures';

describe('api client', () => {
  it('listJobs parses paginated response', async () => {
    const list = await api.listJobs({ page: 1, page_size: 10 });
    expect(list.total).toBe(jobListFixture.total);
    expect(list.items[0]?.job_id).toBe(JOB_ID);
  });

  it('createJob POSTs multipart form and returns the parsed job id', async () => {
    let method: string | null = null;
    server.use(
      http.post('http://localhost/api/v1/jobs', ({ request }) => {
        method = request.method;
        return HttpResponse.json(jobCreateResponse, { status: 201 });
      }),
    );

    const proof = new File(['p'], 'usd.png', { type: 'image/png' });
    const stmt = new File(['s'], 'may.csv', { type: 'text/csv' });
    const result = await api.createJob({
      paymentProofs: [proof],
      bankStatements: [stmt],
      baseCurrency: 'MYR',
    });

    expect(result.job_id).toBe(JOB_ID);
    expect(method).toBe('POST');
  });

  it('getJobStatus, getJobResults, getReviewQueue parse responses', async () => {
    expect((await api.getJobStatus(JOB_ID)).status).toBe('COMPLETED');
    expect((await api.getJobResults(JOB_ID)).summary).toEqual(reportFixture.summary);
    expect(await api.getReviewQueue(JOB_ID)).toEqual([uncertainItem]);
  });

  it('throws ApiError on non-OK responses with a parseable detail', async () => {
    server.use(
      http.get(`http://localhost/api/v1/jobs/${JOB_ID}/results`, () =>
        HttpResponse.json({ detail: 'Report not yet available' }, { status: 409 }),
      ),
    );
    await expect(api.getJobResults(JOB_ID)).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      message: 'Report not yet available',
    });
    expect(ApiError).toBeDefined();
  });

  it('exportJobResults fetches blob from export endpoint', async () => {
    server.use(
      http.get(`http://localhost/api/v1/jobs/${JOB_ID}/export`, () =>
        new HttpResponse(new Blob(['xlsx-content']), {
          status: 200,
          headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        }),
      ),
    );
    const blob = await api.exportJobResults(JOB_ID);
    expect(blob.size).toBeGreaterThan(0);
  });

  it('getQueueStatus parses ingest queue response', async () => {
    const { queueFixture } = await import('@/test/fixtures');
    expect((await api.getQueueStatus()).total_buffered).toBe(queueFixture.total_buffered);
  });

  it('ingestTransactions POSTs JSON payload', async () => {
    let path = '';
    server.use(
      http.post('http://localhost/api/v1/ingest/transactions', ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ buffered: 1, tenant_id: tenantUserFixture.tenant_id }, { status: 202 });
      }),
    );

    const result = await api.ingestTransactions({
      transactions: [{ payment_proof_b64: 'abc', corridor: 'USD/MYR' }],
    });
    expect(path).toContain('/ingest/transactions');
    expect(result.buffered).toBe(1);
  });

  it('flushQueue POSTs to ingest flush endpoint', async () => {
    let path = '';
    server.use(
      http.post('http://localhost/api/v1/ingest/queue/flush', ({ request }) => {
        path = new URL(request.url).pathname;
        return HttpResponse.json({ status: 'flush_queued' });
      }),
    );
    await api.flushQueue();
    expect(path).toContain('/ingest/queue/flush');
  });
});
