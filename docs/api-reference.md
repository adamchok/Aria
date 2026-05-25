---
title: API Reference
layout: default
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

<div class="aria-endpoint">
  <div class="aria-endpoint__header">
    <span class="aria-method aria-method--get">GET</span>
    <span class="aria-endpoint__path">/health</span>
  </div>

### Health check

Returns service status and version.

**Response `200`**

```json
{
  "status": "ok",
  "version": "0.1.0",
  "env": "development"
}
```
</div>

---

<div class="aria-endpoint">
  <div class="aria-endpoint__header">
    <span class="aria-method aria-method--post">POST</span>
    <span class="aria-endpoint__path">/api/v1/jobs</span>
  </div>

### Submit reconciliation job

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `payment_proofs` | file[] | Yes | One or more payment proof files |
| `bank_statement` | file | One of three sources | Bank statement (XLSX, CSV, or PDF). Omit when using ledger references. |
| `bank_statement_id` | string (UUID) | One of three sources | Single uploaded statement from `/bank-accounts/{id}/statements` or `/bank-statements`. Uses uncleared entries only. |
| `bank_account_id` | string (UUID) | One of three sources | Registered bank account. Aggregates **all pending (uncleared) ledger entries** across every statement for that account. |
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
| `400` | Missing proofs, conflicting bank sources, or account has no pending ledger entries |
| `502` | Storage upload failure |

**Example**

```bash
curl -X POST http://localhost:8000/api/v1/jobs \
  -H "Authorization: Bearer YOUR_JWT" \
  -F "payment_proofs=@invoice.pdf" \
  -F "payment_proofs=@receipt.png" \
  -F "bank_statement=@statement.csv" \
  -F "base_currency=MYR"
```
</div>

---

<div class="aria-endpoint">
  <div class="aria-endpoint__header">
    <span class="aria-method aria-method--get">GET</span>
    <span class="aria-endpoint__path">/api/v1/jobs/{job_id}</span>
  </div>

### Poll job status

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

| Status | Meaning | Badge |
| --- | --- | --- |
| `PENDING` | Queued, not yet started | <span class="aria-badge aria-badge--neutral">Pending</span> |
| `RUNNING` | Pipeline in progress | <span class="aria-badge aria-badge--progress">Running</span> |
| `COMPLETED` | Finished successfully | <span class="aria-badge aria-badge--matched">Complete</span> |
| `AWAITING_REVIEW` | Uncertain items need review | <span class="aria-badge aria-badge--uncertain">Review</span> |
| `FAILED` | Unrecoverable error | <span class="aria-badge aria-badge--unmatched">Failed</span> |

**Errors:** `404` if job not found.

The frontend polls this endpoint every **2 seconds** until a terminal status is reached.
</div>

---

<div class="aria-endpoint">
  <div class="aria-endpoint__header">
    <span class="aria-method aria-method--get">GET</span>
    <span class="aria-endpoint__path">/api/v1/jobs/{job_id}/results</span>
  </div>

### Retrieve reconciliation report

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

**Live data after human review:** Match rows and summary counts are **merged from the database** on each request (not a frozen pipeline snapshot). After you `confirm` or `reject` via the review endpoint, call this again — or refresh the results page — to see updated statuses and counts. The executive narrative text is generated once at report time and is not regenerated after review.

**Errors:** `404` job not found · `409` job not yet complete
</div>

---

<div class="aria-endpoint">
  <div class="aria-endpoint__header">
    <span class="aria-method aria-method--get">GET</span>
    <span class="aria-endpoint__path">/api/v1/jobs/{job_id}/review</span>
  </div>

### Human review queue

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
</div>

---

<div class="aria-endpoint">
  <div class="aria-endpoint__header">
    <span class="aria-method aria-method--get">GET</span>
    <span class="aria-endpoint__path">/api/v1/jobs/{job_id}/bank-entries</span>
  </div>

### List bank ledger rows for manual match

Returns uncleared ledger entries (when the job used a bank account or statement) or the bank statement snapshot stored on the job report (file upload jobs). Used by the review UI ledger picker.

**Response `200`** — array of `BankEntry` objects (`id`, `value_date`, `amount`, `currency`, `description`, `reference`, `counterparty`).

</div>

---

<div class="aria-endpoint">
  <div class="aria-endpoint__header">
    <span class="aria-method aria-method--post">POST</span>
    <span class="aria-endpoint__path">/api/v1/jobs/{job_id}/review/{match_id}</span>
  </div>

### Submit human review decision

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
| `bank_entry_id` | UUID | For `manual_match` only | Target bank entry from `GET .../bank-entries` |
| `note` | string | No | Optional reviewer note |

**Response `200`**

```json
{
  "match_id": "...",
  "status": "MATCHED",
  "human_reviewed": true,
  "note": "Matched to Moonshot debit",
  "bank_entry": { "id": "...", "value_date": "2026-04-30", "amount": "-20.20", "currency": "MYR" }
}
```

**Idempotency:** Re-submitting `confirm` or `reject` on an already-reviewed match returns the current state without error. `manual_match` may be submitted again to change the linked bank entry and note.

**Side effects:** Updates the match row, refreshes the stored report blob (matches + summary), and sets job status to `COMPLETED` when no uncertain items remain. For jobs tied to a bank account or statement ledger, `confirm` and `manual_match` mark the linked bank entry **cleared** (same as auto-matched rows at pipeline completion).

**Errors:** `404` match not found · `409` invalid job state
</div>

---

<div class="aria-endpoint">
  <div class="aria-endpoint__header">
    <span class="aria-method aria-method--get">GET</span>
    <span class="aria-endpoint__path">/api/v1/jobs/{job_id}/export</span>
  </div>

### Download Excel report

**Response `200`**

- **Content-Type:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- **Content-Disposition:** `attachment; filename="aria-reconciliation-{job_id}.xlsx"`

**Sheets:** Summary · Matched · Exceptions · Audit Log

Uses the same **live hydrated report** as `GET /results` (reflects human review decisions).

**Errors:** `404` job not found · `409` report not yet available

**Example**

```bash
curl -OJ http://localhost:8000/api/v1/jobs/YOUR_JOB_ID/export
```
</div>

---

## Authentication

All `/api/v1` endpoints (except `/health`, `/docs`, `/redoc`, `/openapi.json`, `/api/v1/auth/login`) accept **either**:

1. **JWT** — `Authorization: Bearer <token>` from `POST /api/v1/auth/login`
2. **API key** (legacy/programmatic) — `X-API-Key: aria_…`

```bash
# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@aria.local","password":"your-password"}'

# Use token
curl -H "Authorization: Bearer YOUR_JWT" http://localhost:8000/api/v1/jobs
```

| Status | Cause |
| --- | --- |
| `401` | Missing/invalid token or API key |
| `403` | Valid auth but insufficient role |

### Auth endpoints

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/auth/login` | Email + password → JWT |
| `GET` | `/api/v1/auth/me` | Current user (Bearer required) |

### Tenant settings (mgmt app, JWT tenant_user)

| Method | Path | Description |
| --- | --- | --- |
| `GET/POST` | `/api/v1/tenant/keys` | List/create API keys |
| `DELETE` | `/api/v1/tenant/keys/{id}` | Revoke key |
| `GET/POST` | `/api/v1/tenant/users` | List/invite tenant users |

### Admin-only

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/analytics/admin/summary` | Cross-tenant analytics |
| `GET` | `/api/v1/ingest/admin/queue` | All tenant queue status |
| `POST` | `/api/v1/ingest/admin/queue/flush/{tenant_id}` | Flush tenant buffer |

Legacy **admin API key** (`ADMIN_API_KEY`) still works for programmatic tenant management via `X-API-Key`.

### User management (admin app, JWT admin)

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/v1/users` | Create user (`admin` or `tenant_user`; `tenant_id` required for tenant users) |
| `GET` | `/api/v1/users` | List users (optional `tenant_id` filter) |
| `DELETE` | `/api/v1/users/{user_id}` | Deactivate user |

---

## Platform endpoints

<div class="aria-endpoint">
  <div class="aria-endpoint__header">
    <span class="aria-method aria-method--get">GET</span>
    <span class="aria-endpoint__path">/api/v1/jobs</span>
  </div>

### List jobs

Returns a paginated list of jobs scoped to the authenticated tenant.

**Query parameters**

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| `page` | int | `1` | Page number |
| `page_size` | int | `20` | Items per page (max 100) |
| `status` | enum | — | Filter by job status |

**Response `200`**

```json
{
  "items": [
    {
      "job_id": "550e8400-...",
      "status": "COMPLETED",
      "progress_pct": 100.0,
      "base_currency": "MYR",
      "record_count": 12,
      "matched_count": 10,
      "uncertain_count": 1,
      "unmatched_count": 1,
      "created_at": "2026-05-23T10:00:00Z",
      "updated_at": "2026-05-23T10:00:45Z"
    }
  ],
  "total": 42,
  "page": 1,
  "page_size": 20
}
```
</div>

---

<div class="aria-endpoint">
  <div class="aria-endpoint__header">
    <span class="aria-method aria-method--get">GET</span>
    <span class="aria-endpoint__path">/api/v1/jobs/{job_id}/stream</span>
  </div>

### Job progress stream (SSE)

Server-Sent Events stream delivering real-time pipeline progress. Events are emitted at each agent boundary.

**Response** — `text/event-stream`

Event types:

| Event | When | Payload fields |
| --- | --- | --- |
| `status_change` | Agent starts | `status`, `progress_pct` |
| `agent_complete` | Agent finishes | `agent`, `progress_pct`, `agents_completed` |
| `progress_update` | Mid-agent | `progress_pct` |
| `match_found` | Per match | `match_id`, `status`, `confidence` |
| `completed` | Terminal | `status`, `summary` |
| `review_required` | Terminal | `status`, `summary` |
| `error` | Terminal | `status`, `error` |

```
event: status_change
data: {"status": "INGESTING", "progress_pct": 5.0}

event: agent_complete
data: {"agent": "ingestion", "progress_pct": 25.0, "agents_completed": ["ingestion"]}

event: completed
data: {"status": "COMPLETED", "summary": {"matched": 10, "uncertain": 1, "unmatched": 1, "total": 12}}
```

The frontend `useJobStream` hook wraps `EventSource`, reconnects on transient errors, and hydrates the TanStack Query cache on each event. Polling via `GET /jobs/{id}` is retained as a fallback.

**Authentication:** Browsers cannot send `Authorization` headers on `EventSource`. Pass the JWT as a query parameter: `GET /api/v1/jobs/{job_id}/stream?access_token=YOUR_JWT`. Restrict this to the stream path only.
</div>

---

<div class="aria-endpoint">
  <div class="aria-endpoint__header">
    <span class="aria-method aria-method--get">GET</span>
    <span class="aria-endpoint__path">/api/v1/tenants</span>
  </div>

### List tenants (admin only)

Requires admin JWT or `X-API-Key: {ADMIN_API_KEY}`.

**Response `200`** — `TenantResponse[]`
</div>

---

<div class="aria-endpoint">
  <div class="aria-endpoint__header">
    <span class="aria-method aria-method--post">POST</span>
    <span class="aria-endpoint__path">/api/v1/tenants</span>
  </div>

### Create tenant (admin only)

Requires admin JWT or `X-API-Key: {ADMIN_API_KEY}`.

**Request body**

```json
{ "name": "Acme Corp" }
```

**Response `201`**

```json
{
  "id": "...",
  "name": "Acme Corp",
  "created_at": "2026-05-23T10:00:00Z"
}
```
</div>

---

<div class="aria-endpoint">
  <div class="aria-endpoint__header">
    <span class="aria-method aria-method--post">POST</span>
    <span class="aria-endpoint__path">/api/v1/tenants/{tenant_id}/keys</span>
  </div>

### Generate API key (admin only)

**Request body**

```json
{ "label": "Production webhook integration" }
```

**Response `201`**

```json
{
  "id": "...",
  "tenant_id": "...",
  "label": "Production webhook integration",
  "enabled": true,
  "created_at": "2026-05-23T10:00:00Z",
  "key": "aria_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**The `key` field is returned only on creation** — it is never retrievable again. Store it securely immediately.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/tenants/{id}/keys` | List all keys for tenant |
| `DELETE` | `/api/v1/tenants/{id}/keys/{key_id}` | Revoke key |
</div>

---

<div class="aria-endpoint">
  <div class="aria-endpoint__header">
    <span class="aria-method aria-method--post">POST</span>
    <span class="aria-endpoint__path">/api/v1/ingest/transactions</span>
  </div>

### Ingest transactions

Push raw transactions from external systems into the buffer. Transactions are automatically batched into reconciliation jobs by Celery Beat when the count or time threshold is reached.

**Request body**

```json
{
  "transactions": [
    {
      "payment_proof_b64": "<base64-encoded image or PDF>",
      "corridor": "USD/MYR",
      "value_date": "2026-05-23"
    }
  ]
}
```

| Field | Type | Description |
| --- | --- | --- |
| `payment_proof_b64` | string | Base64-encoded document (mutually exclusive with `storage_key`) |
| `storage_key` | string | Pre-uploaded MinIO key |
| `corridor` | string | e.g. `USD/MYR`, `EUR/MYR` |
| `value_date` | date | Transaction value date |

**Response `202`**

```json
{ "buffered": 12, "tenant_id": "..." }
```

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/ingest/queue` | Queue status by corridor + trigger prediction |
| `POST` | `/api/v1/ingest/queue/flush` | Force-batch immediately |
</div>

---

<div class="aria-endpoint">
  <div class="aria-endpoint__header">
    <span class="aria-method aria-method--post">POST</span>
    <span class="aria-endpoint__path">/api/v1/webhooks</span>
  </div>

### Register webhook

**Request body**

```json
{
  "url": "https://erp.example.com/webhooks/aria",
  "events": ["job.completed", "job.review_required"],
  "label": "ERP integration"
}
```

Supported events: `job.completed`, `job.failed`, `job.review_required`

**Response `201`**

```json
{
  "id": "...",
  "url": "https://erp.example.com/webhooks/aria",
  "events": ["job.completed", "job.review_required"],
  "enabled": true,
  "created_at": "2026-05-23T10:00:00Z",
  "secret": "whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**The `secret` is returned only on creation.** Use it to verify HMAC-SHA256 signatures on incoming webhook payloads:

```
X-ARIA-Signature: sha256=<hmac_hex>
X-ARIA-Timestamp: <unix_timestamp>
```

Delivery is retried up to 3 times with exponential backoff. Payloads that do not receive a `2xx` within 10 seconds are retried.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/webhooks` | List all webhooks |
| `DELETE` | `/api/v1/webhooks/{id}` | Remove webhook |
| `POST` | `/api/v1/webhooks/{id}/test` | Queue `job.test` delivery (no real job row; requires Celery worker) |
| `GET` | `/api/v1/webhooks/{id}/deliveries` | Delivery history (`job_id` is null for test events) |
</div>

---

<div class="aria-endpoint">
  <div class="aria-endpoint__header">
    <span class="aria-method aria-method--get">GET</span>
    <span class="aria-endpoint__path">/api/v1/analytics/summary</span>
  </div>

### Analytics summary

Aggregated reconciliation statistics for the authenticated tenant.

**Query parameters**

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| `period_start` | date | 30 days ago | Start of reporting window |
| `period_end` | date | today | End of reporting window |

**Response `200`**

```json
{
  "tenant_id": "...",
  "period_start": "2026-04-23",
  "period_end": "2026-05-23",
  "total_jobs": 15,
  "total_records": 312,
  "matched_records": 289,
  "uncertain_records": 18,
  "unmatched_records": 5,
  "avg_match_rate": 0.926,
  "avg_processing_seconds": 41.2,
  "escalation_rate": 0.058,
  "by_corridor": [
    { "corridor": "*/MYR", "job_count": 8, "record_count": 180, "avg_match_rate": 0.944 }
  ]
}
```
</div>

---

## Bank accounts and ledger

Tenants register named bank accounts, upload monthly statements, and browse a persistent ledger. Entries are marked **cleared** when matched by a reconciliation job (auto-match at pipeline completion, or human `confirm` / `manual_match` during review).

**Ledger amount convention:** positive = deposit/credit (money in), negative = withdrawal/debit (money out). PDF parsers read separate Withdrawal/Deposit columns when present (e.g. CIMB) and never store the running balance as the transaction amount.

<div class="aria-endpoint">
  <div class="aria-endpoint__header">
    <span class="aria-method aria-method--post">POST</span>
    <span class="aria-endpoint__path">/api/v1/bank-accounts</span>
  </div>

### Create bank account

**Request body** (`application/json`)

```json
{
  "name": "Main Operating",
  "bank_name": "Maybank",
  "currency": "MYR",
  "account_number_last4": "1234"
}
```

**Response `201`** — `BankAccountResponse`
</div>

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/bank-accounts` | List accounts for authenticated tenant |
| `GET` | `/api/v1/bank-accounts/{id}` | Account detail |
| `DELETE` | `/api/v1/bank-accounts/{id}` | Delete account |
| `POST` | `/api/v1/bank-accounts/{id}/statements` | Upload statement (multipart) to account |
| `GET` | `/api/v1/bank-accounts/{id}/statements` | List statements for account |
| `DELETE` | `/api/v1/bank-accounts/{id}/statements/{statement_id}` | Delete statement and all its ledger entries |
| `GET` | `/api/v1/bank-accounts/{id}/ledger` | Paginated ledger entries (`cleared` filter optional) |
| `PATCH` | `/api/v1/bank-accounts/{id}/ledger/{entry_id}` | Edit a pending ledger entry |
| `DELETE` | `/api/v1/bank-accounts/{id}/ledger/{entry_id}` | Delete a pending ledger entry (409 if cleared) |

<div class="aria-endpoint">
  <div class="aria-endpoint__header">
    <span class="aria-method aria-method--post">POST</span>
    <span class="aria-endpoint__path">/api/v1/bank-statements</span>
  </div>

### Upload bank statement (standalone)

**Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `bank_statement` | file | Yes | XLSX, CSV, or PDF |
| `base_currency` | string | No | Default `MYR` |
| `account_id` | UUID | No | Link statement to a bank account |

**Response `201`** — `BankStatementUploadResponse` with `entry_count` and statement period dates.
</div>

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/v1/bank-statements` | List statements (paginated) |
| `GET` | `/api/v1/bank-statements/{id}` | Statement detail with all entries |
| `GET` | `/api/v1/bank-statements/{id}/entries` | Entries only (`cleared` filter optional) |

---

## Job lifecycle

```mermaid
stateDiagram-v2
  [*] --> PENDING
  PENDING --> RUNNING
  RUNNING --> COMPLETED
  RUNNING --> AWAITING_REVIEW
  RUNNING --> FAILED
  AWAITING_REVIEW --> COMPLETED: human review
  COMPLETED --> [*]
  FAILED --> [*]
```

1. **Submit** — files uploaded to MinIO; job row created; Celery task enqueued
2. **Process** — worker runs OpenAI Agents SDK pipeline; progress updated per stage
3. **Complete** — report stored; status set to `COMPLETED` or `AWAITING_REVIEW`
4. **Review** (optional) — human confirms or rejects uncertain matches; results and export update immediately
5. **Export** — Excel generated from the hydrated report (includes review outcomes)

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

Frontend TypeScript types in each app's `src/types/api.ts` (`frontend-novapay`, `frontend-admin`, `frontend-tenant-mgmt`) mirror these schemas. Monetary values are serialised as **strings** to preserve decimal precision across the JSON boundary.
