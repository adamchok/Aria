---
title: API Reference
layout: default
nav_order: 7
description: "REST API endpoints, request/response shapes, and job lifecycle"
---

# API Reference

{: .no_toc }

## Table of contents
{: .no_toc .text-delta }
1. TOC
{:toc}

---

## Base URL

| Environment | Base URL |
| --- | --- |
| Local API | `http://localhost:8000` |
| Docker (direct) | `http://localhost:8000` |
| Docker (via frontend nginx) | `http://localhost:5173/api` |
| Vite dev proxy | `http://localhost:5173/api` |

Interactive documentation: [http://localhost:8000/docs](http://localhost:8000/docs) (Swagger UI)

All v1 routes are prefixed with `/api/v1`.

---

## Health

### `GET /health`

Returns service status and version.

**Response `200`**

```json
{
  "status": "ok",
  "version": "0.1.0",
  "env": "development"
}
```

---

## Jobs

### `POST /api/v1/jobs`

Submit a new reconciliation job.

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `payment_proofs` | file[] | Yes | One or more payment proof files |
| `bank_statement` | file | Yes | Bank statement (XLSX or CSV) |
| `base_currency` | string | No | ISO 4217 code (default: `MYR`) |

**Accepted MIME types for proofs:** `image/jpeg`, `image/png`, `image/webp`, `application/pdf`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `text/csv`, `application/csv`

**Response `201`**

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "PENDING",
  "created_at": "2026-05-23T10:00:00Z"
}
```

**Errors**

| Status | Cause |
| --- | --- |
| `400` | Missing proofs or bank statement |
| `502` | Storage upload failure |

**Example**

```bash
curl -X POST http://localhost:8000/api/v1/jobs \
  -F "payment_proofs=@invoice.pdf" \
  -F "payment_proofs=@receipt.png" \
  -F "bank_statement=@statement.csv" \
  -F "base_currency=MYR"
```

---

### `GET /api/v1/jobs/{job_id}`

Poll job status and progress.

**Response `200`**

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "RUNNING",
  "progress_pct": 50.0,
  "agents_completed": ["ingestion", "normalisation"],
  "error": null,
  "created_at": "2026-05-23T10:00:00Z",
  "updated_at": "2026-05-23T10:00:15Z"
}
```

**Job statuses**

| Status | Meaning |
| --- | --- |
| `PENDING` | Queued, not yet started |
| `RUNNING` | Pipeline in progress |
| `COMPLETED` | Finished; all matches resolved or none uncertain |
| `AWAITING_REVIEW` | Pipeline done; uncertain items need human review |
| `FAILED` | Unrecoverable error (`error` field populated) |

**Errors:** `404` if job not found.

The frontend polls this endpoint every **2 seconds** until a terminal status is reached.

---

### `GET /api/v1/jobs/{job_id}/results`

Retrieve the full reconciliation report.

**Response `200`** — `ReconciliationReport`

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "summary": {
    "total": 4,
    "matched": 2,
    "uncertain": 1,
    "unmatched": 1,
    "total_value_myr": "1234.56"
  },
  "matches": [ "..." ],
  "audit_log": [ "..." ]
}
```

Each match in `matches` includes:

| Field | Type | Description |
| --- | --- | --- |
| `id` | UUID | Match identifier |
| `status` | enum | `MATCHED` \| `UNCERTAIN` \| `UNMATCHED` |
| `confidence` | float | 0.0 – 1.0 composite score |
| `amount_variance_myr` | string | Decimal as string |
| `variance_explanation` | string | Plain-language explanation |
| `reasoning_chain` | string | Full LLM chain for audit |
| `normalised_record` | object | Payment + MYR amounts + tolerance bounds |
| `bank_entry` | object \| null | Matched bank statement row |

**Errors:** `404` job not found · `409` job not yet complete

---

### `GET /api/v1/jobs/{job_id}/review`

Fetch items requiring human review (`status = UNCERTAIN` only).

**Response `200`** — `MatchResult[]`

```json
[
  {
    "id": "...",
    "status": "UNCERTAIN",
    "confidence": 0.68,
    "variance_explanation": "Amount differs by MYR 0.20, likely due to FX rate on settlement date...",
    "normalised_record": { "..." },
    "bank_entry": { "..." }
  }
]
```

Returns an empty array when no uncertain items remain.

---

### `POST /api/v1/jobs/{job_id}/review/{match_id}`

Submit a human decision on an uncertain match.

**Content-Type:** `application/json`

```json
{
  "action": "confirm",
  "bank_entry_id": null,
  "note": "Verified against SWIFT advice"
}
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `action` | enum | Yes | `confirm` \| `reject` \| `manual_match` |
| `bank_entry_id` | UUID | For `manual_match` | Target bank entry |
| `note` | string | No | Optional reviewer note |

**Response `200`**

```json
{
  "match_id": "...",
  "status": "MATCHED",
  "human_reviewed": true
}
```

**Idempotency:** Re-submitting `confirm` or `reject` on an already-reviewed match returns the current state without error.

**Errors:** `404` match not found · `409` invalid job state

---

### `GET /api/v1/jobs/{job_id}/export`

Download the reconciliation Excel report.

**Response `200`**

- **Content-Type:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **Content-Disposition:** `attachment; filename="aria-reconciliation-{job_id}.xlsx"`

**Sheets:** Summary · Matched · Exceptions · Audit Log

**Errors:** `404` job not found · `409` report not yet available

**Example**

```bash
curl -OJ http://localhost:8000/api/v1/jobs/YOUR_JOB_ID/export
```

---

## Job lifecycle

```text
POST /jobs
    │
    ▼
 PENDING ──► RUNNING ──► COMPLETED
                │              ▲
                │              │
                └─► AWAITING_REVIEW ──► (human review) ──► COMPLETED
                │
                └─► FAILED
```

1. **Submit** — files uploaded to MinIO; job row created; Celery task enqueued
2. **Process** — worker runs LangGraph pipeline; progress updated per agent
3. **Complete** — report stored; status set to `COMPLETED` or `AWAITING_REVIEW`
4. **Review** (optional) — human confirms/rejects uncertain matches via review endpoint
5. **Export** — Excel generated from stored report blob

---

## Error responses

All errors return JSON:

```json
{
  "detail": "Human-readable error message"
}
```

| Status | Domain errors |
| --- | --- |
| `404` | Job or match not found |
| `409` | Invalid job state (e.g. results before complete) |
| `422` | Extraction failure |
| `502` | LLM or storage error |
| `503` | FX rate unavailable (all providers failed) |

---

## OpenAPI

The live OpenAPI 3 schema is served at:

- Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)
- ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- JSON schema: [http://localhost:8000/openapi.json](http://localhost:8000/openapi.json)

Frontend TypeScript types in `frontend/src/types/api.ts` mirror these schemas. Monetary values are serialised as **strings** to preserve decimal precision across the JSON boundary.
