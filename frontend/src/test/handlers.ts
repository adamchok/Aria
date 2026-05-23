import { HttpResponse, http } from 'msw';
import {
  JOB_ID,
  jobCreateResponse,
  jobStatusCompleted,
  reportFixture,
  uncertainItem,
} from './fixtures';
import type { ReviewActionRequest, ReviewActionResponse } from '@/types/api';

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
];
