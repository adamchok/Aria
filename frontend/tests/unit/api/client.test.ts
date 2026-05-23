import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/msw-server';
import { ApiError, api } from '@/api/client';
import { JOB_ID, jobCreateResponse, reportFixture, uncertainItem } from '@/test/fixtures';

describe('api client', () => {
  it('createJob POSTs a request body and returns the parsed job id', async () => {
    let method: string | null = null;
    let bodyLength = 0;
    server.use(
      http.post('http://localhost/api/v1/jobs', async ({ request }) => {
        method = request.method;
        const body = await request.arrayBuffer();
        bodyLength = body.byteLength;
        return HttpResponse.json(jobCreateResponse, { status: 201 });
      }),
    );

    const proof = new File(['p'], 'usd.png', { type: 'image/png' });
    const stmt = new File(['s'], 'may.csv', { type: 'text/csv' });
    const result = await api.createJob({
      paymentProofs: [proof],
      bankStatement: stmt,
      baseCurrency: 'MYR',
    });

    expect(result.job_id).toBe(JOB_ID);
    expect(method).toBe('POST');
    expect(bodyLength).toBeGreaterThan(0);
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

  it('exportUrl returns a deterministic path', () => {
    expect(api.exportUrl(JOB_ID)).toMatch(new RegExp(`/api/v1/jobs/${JOB_ID}/export$`));
  });
});
