# ARIA Platform Architecture

**Version:** 2.0  
**Date:** 2026-05-24  
**Status:** Proposed  
**Authors:** ARIA Engineering

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State](#2-current-state)
3. [Vision: AI-First Platform](#3-vision-ai-first-platform)
4. [Architectural Decisions](#4-architectural-decisions)
   - [AD-1: API-Key Authentication & Multi-Tenancy](#ad-1-api-key-authentication--multi-tenancy)
   - [AD-2: Continuous Transaction Ingestion Pipeline](#ad-2-continuous-transaction-ingestion-pipeline)
   - [AD-3: Server-Sent Events for Real-Time Streaming](#ad-3-server-sent-events-for-real-time-streaming)
   - [AD-4: Webhook Delivery for External Integrations](#ad-4-webhook-delivery-for-external-integrations)
   - [AD-5: Enterprise Reference Frontend](#ad-5-enterprise-reference-frontend)
5. [Data Model Changes](#5-data-model-changes)
6. [API Contract](#6-api-contract)
7. [Infrastructure Changes](#7-infrastructure-changes)
8. [Security Posture](#8-security-posture)
9. [Implementation Roadmap](#9-implementation-roadmap)
10. [Success Metrics](#10-success-metrics)

---

## 1. Executive Summary

ARIA was built to solve a precise problem: automating cross-border payment reconciliation for SMEs using an LLM reasoning chain as the reconciliation engine. Version 1 proved the core thesis — a four-agent LangGraph pipeline can extract, normalise, and match transactions with confidence scoring that replaces hours of manual work.

Version 2 repositions ARIA from a **standalone application** into an **AI-first reconciliation platform**. The intelligence engine remains unchanged and continues to be the authoritative decision-maker. What changes is the surface area around it: the API becomes the primary interface, multiple SME frontends connect independently via authenticated integration, transactions flow in continuously rather than arriving as manual uploads, and the reference frontend evolves into an enterprise operations dashboard.

The result is a system where ARIA's reconciliation capability is composable — embeddable into any treasury workflow, any SME toolchain, without requiring users to adopt the ARIA UI.

---

## 2. Current State

### 2.1 Architecture Overview

```
[ARIA React SPA]
      │  manual file upload
      ▼
[FastAPI REST API]  ──►  [Celery Worker]  ──►  [LangGraph Pipeline]
      │                                               │
      ▼                                               ▼
[PostgreSQL]                                  [Claude Sonnet/Haiku]
[MinIO (documents)]
[Redis (job queue)]
```

### 2.2 What Works Well

- **LangGraph pipeline** — The four-agent design (Ingestion → Normalisation → Matching → Report) is modular, typed, and routes correctly on confidence thresholds.
- **Confidence-gated human review** — Uncertain matches (0.50–0.74) are never auto-confirmed; the review queue is a first-class API surface.
- **Audit-first design** — Every agent decision writes a structured `AuditLogEntry` with input snapshot, reasoning chain, confidence, and timestamp.
- **Celery + Redis task queue** — Async job processing with fallback to inline execution for development.
- **Type safety** — Pydantic v2 models on the backend; strict TypeScript on the frontend; both sides mirror the same schemas.

### 2.3 Limitations of the Current Model

| Limitation | Impact |
|------------|--------|
| No authentication | Any caller can submit jobs and read results; not suitable for production multi-tenant deployment |
| Single-tenant data model | All jobs are globally visible; SME data isolation is impossible |
| Manual file upload only | External systems (ERPs, treasury tools) cannot programmatically push transactions |
| 2-second polling | 30 requests per minute per open browser tab; does not scale to concurrent users |
| No push notification | External SME frontends must poll; no webhook contract for integrations |
| Single-job workflow UI | Frontend shows one job at a time; no operational visibility across the pipeline |

---

## 3. Vision: AI-First Platform

The following diagram represents the target architecture. The AI engine sits at the centre; everything else — including the reference UI — is a client.

```
                    ┌──────────────────────────────────────┐
                    │           SME Ecosystem              │
                    │                                      │
  ┌─────────────┐   │  ┌──────────────┐  ┌─────────────┐   │
  │  ARIA       │   │  │ SME Frontend │  │  ERP / TMS  │   │
  │  Reference  │   │  │ (custom)     │  │  (e.g.SAP)  │   │
  │  Frontend   │   │  └──────┬───────┘  └──────┬──────┘   │
  └──────┬──────┘   │         │ X-API-Key        │         │
         │ X-API-Key│         │                  │ Webhook │
         └──────────┼─────────┘                  │         │
                    │         │                  │         │
                    └─────────┼──────────────────┼─────────┘
                              │                  │
                              ▼                  ▼
                    ┌──────────────────────────────────────┐
                    │         FastAPI Gateway              │
                    │   (auth middleware, tenant context)  │
                    └──┬───────────────────────────────────┘
                       │
          ┌────────────┼──────────────┬──────────────────┐
          ▼            ▼              ▼                  ▼
  ┌──────────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐
  │  Job Queue   │  │  Ingest  │  │  Stream  │  │   Webhook     │
  │  (Celery +   │  │  Buffer  │  │  (SSE)   │  │   Delivery    │
  │   Redis)     │  │  (auto-  │  │          │  │   (Celery)    │
  │              │  │  batch)  │  │          │  │               │
  └──────┬───────┘  └──────────┘  └──────────┘  └───────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────────┐
│                    LangGraph Pipeline                      │
│                                                            │
│  [Agent 1: Ingestion] ──► [Agent 2: Normalisation]         │
│         │                        │                         │
│         └──► [human_review_queue]◄── [Agent 3: Matching]   │
│                                        │                   │
│                                  [Agent 4: Report]         │
└──────────────────┬─────────────────────────────────────────┘
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
 [PostgreSQL]  [MinIO]    [Claude API]
 (multi-tenant (tenant-   (Sonnet +
  scoped data)  isolated   Haiku)
               storage)
```

### 3.1 Design Principles

1. **AI engine is the product.** The frontend is a client, not the product. Any SME should be able to integrate ARIA's reconciliation capability without adopting the ARIA UI.
2. **Push over pull.** SSE for browser clients; webhooks for external systems. Polling is a fallback, not the primary model.
3. **Tenant isolation by default.** Every API call is scoped to a tenant. Cross-tenant data access is architecturally impossible, not just policy-controlled.
4. **Continuous pipeline.** Transactions arrive asynchronously and are automatically batched. The pipeline runs without human initiation.
5. **Backward compatibility.** The existing manual upload workflow (`POST /api/v1/jobs` multipart) remains fully supported for the reference UI and existing integrations.

---

## 4. Architectural Decisions

### AD-1: API-Key Authentication & Multi-Tenancy

#### Problem

The current API has no authentication layer. `tenant_id` does not exist in the data model. Deploying ARIA for multiple SMEs in the current state would result in data leakage between tenants.

#### Decision

Introduce **API key authentication** with tenant-scoped data isolation.

**Authentication flow:**
1. Admin creates a tenant via `POST /api/v1/tenants` (protected by `ADMIN_API_KEY` env var).
2. Tenant generates one or more API keys via `POST /api/v1/tenants/{id}/keys`.
3. Every API request must include `X-API-Key: {key}` header.
4. `APIKeyMiddleware` (FastAPI middleware) validates the key against the hashed store, resolves `tenant_id`, and injects it into `request.state`.
5. All repository queries append `WHERE tenant_id = :tenant_id` automatically.

**Data isolation:**
- `tenant_id` FK column added to `JobORM`, `MatchORM`, `AuditLogORM` via Alembic migration.
- MinIO object paths prefixed: `{tenant_id}/{job_id}/{filename}`.
- Repository base class gains `_assert_tenant(record, tenant_id)` guard.

**Why API keys over OAuth:**
OAuth 2.0 adds significant infrastructure (authorization server, token refresh, PKCE flows) appropriate for user-facing consumer apps. B2B SaaS integrations standardise on API keys (Stripe, Anthropic, GitHub all use this model for machine-to-machine calls). Keys are simple to issue, rotate, and scope. OAuth can be added later as a complementary layer for user sessions without changing the machine integration contract.

#### Implementation

```python
# backend/app/models/database.py (additions)
class TenantORM(Base):
    __tablename__ = "tenants"
    id: str           # UUID
    name: str
    created_at: datetime

class ApiKeyORM(Base):
    __tablename__ = "api_keys"
    id: str           # UUID
    tenant_id: str    # FK → tenants.id
    key_hash: str     # SHA-256 of raw key (raw key shown once at creation)
    label: str
    last_used_at: Optional[datetime]
    expires_at: Optional[datetime]
    enabled: bool

# All existing ORM tables gain:
# tenant_id: str  (FK → tenants.id, NOT NULL, indexed)
```

```python
# backend/app/core/middleware.py
class APIKeyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in EXEMPT_PATHS:  # /health, /docs
            return await call_next(request)
        key = request.headers.get("X-API-Key")
        tenant = await resolve_tenant(key)     # hash, lookup, cache
        if not tenant:
            return JSONResponse({"detail": "Invalid API key"}, status_code=401)
        request.state.tenant_id = tenant.id
        return await call_next(request)
```

---

### AD-2: Continuous Transaction Ingestion Pipeline

#### Problem

ARIA's current entry point is a manual file upload through a browser. External treasury systems, ERPs, and automated payment platforms cannot integrate without human intervention at the upload step. This limits ARIA to reactive, manual workflows rather than continuous autonomous reconciliation.

#### Decision

Introduce a **transaction ingestion buffer** with **automatic batching** via Celery Beat.

**Ingestion flow:**

```
External System
      │
      │  POST /api/v1/ingest/transactions
      │  [{ payment_proof_b64, bank_entry, corridor, value_date }, ...]
      ▼
TransactionBufferORM  ←── status: BUFFERED
      │
      │  Celery Beat (every N minutes)
      ▼
  Batch Check: count ≥ BATCH_SIZE_THRESHOLD
            OR oldest_record_age ≥ BATCH_TIME_WINDOW_MINUTES
      │
      ▼
JobORM created → Celery task enqueued → LangGraph pipeline runs
      │
TransactionBufferORM  ←── status: BATCHED, job_id set
```

**Dual-trigger batching logic:**

```python
# backend/app/workers/tasks.py
@celery_app.task
def auto_batch_transactions():
    """Runs every CELERY_BEAT_INTERVAL_MINUTES minutes."""
    per_tenant_buffers = query_buffered_transactions_grouped_by_tenant()
    for tenant_id, transactions in per_tenant_buffers:
        oldest = min(t.received_at for t in transactions)
        age_minutes = (utcnow() - oldest).total_seconds() / 60
        should_batch = (
            len(transactions) >= settings.batch_size_threshold  # count trigger
            or age_minutes >= settings.batch_time_window_minutes  # time trigger
        )
        if should_batch:
            job = create_job_from_buffer(tenant_id, transactions)
            enqueue_job(job.id)
```

**Why dual-trigger over fixed schedule alone:**  
A pure time-window schedule creates uneven load (all batches fire simultaneously) and leaves large transaction volumes waiting unnecessarily. A pure count threshold leaves small-volume tenants with transactions stuck indefinitely during quiet periods. The dual-trigger adapts to both high-volume and low-volume tenants with the same configuration.

**New environment variables:**

```bash
BATCH_SIZE_THRESHOLD=50          # Trigger batch when ≥ N transactions buffered
BATCH_TIME_WINDOW_MINUTES=15     # Trigger batch when oldest transaction is ≥ N minutes old
CELERY_BEAT_INTERVAL_MINUTES=2   # How often the scheduler checks
```

**Manual upload remains supported:** `POST /api/v1/jobs` (multipart) is unchanged. The reference frontend continues to use it.

---

### AD-3: Server-Sent Events for Real-Time Streaming

#### Problem

The frontend polls `GET /api/v1/jobs/{id}` every 2 seconds. At 10 concurrent users monitoring active jobs, this generates 600 requests per minute of identical responses. External systems integrating via API face the same polling burden. The pipeline has no mechanism to push progress updates.

#### Decision

Add an **SSE streaming endpoint** and migrate the frontend from polling to `EventSource`.

**Endpoint:**

```
GET /api/v1/jobs/{job_id}/stream
Content-Type: text/event-stream
Cache-Control: no-cache
```

**Event types:**

| Event | Payload | Fired when |
|-------|---------|-----------|
| `status_change` | `{status, progress_pct}` | Job status transitions |
| `agent_complete` | `{agent, duration_ms}` | Each agent finishes |
| `progress_update` | `{progress_pct, message}` | Within-agent progress milestones |
| `match_found` | `{match_id, status, confidence}` | Each match result recorded |
| `review_required` | `{uncertain_count}` | Pipeline routed to review queue |
| `completed` | `{summary}` | Job reaches COMPLETED |
| `error` | `{detail}` | Job fails |

**Implementation approach:**  
The pipeline runner writes events to an asyncio queue keyed by `job_id`. The SSE endpoint reads from this queue and streams events as they arrive. The queue is held in-process (appropriate for single-process deployments); for multi-worker deployments, Redis pub/sub replaces the in-process queue with no change to the API contract.

**Frontend migration:**

```typescript
// frontend/src/hooks/useJobStream.ts
export function useJobStream(jobId: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const es = new EventSource(`/api/v1/jobs/${jobId}/stream`);
    es.addEventListener('status_change', (e) => {
      const data = JSON.parse(e.data);
      queryClient.setQueryData(['job', jobId, 'status'], (old) => ({
        ...old, ...data
      }));
    });
    es.addEventListener('completed', () => es.close());
    es.addEventListener('error', () => {
      es.close();
      // Fall back to polling via useJobStatus
    });
    return () => es.close();
  }, [jobId]);
}
```

The polling hook (`useJobStatus`) is retained as a fallback — if `EventSource` construction fails (e.g., behind a proxy that buffers SSE), the component falls back gracefully.

---

### AD-4: Webhook Delivery for External Integrations

#### Problem

SMEs integrating ARIA into their own ERP or treasury management system need event notification when reconciliation completes. Their systems cannot maintain a persistent SSE connection, and polling an external API adds latency and infrastructure complexity on their side.

#### Decision

Implement **signed webhook delivery** using the industry-standard pattern (Stripe, GitHub, Plaid).

**Registration:**

```
POST /api/v1/webhooks
{
  "url": "https://erp.company.com/aria-webhook",
  "events": ["job.completed", "job.review_required", "job.failed"],
  "label": "SAP Integration"
}
→ { "id": "wh_...", "secret": "whsec_..." }  ← shown once
```

**Delivery:**

1. Pipeline runner calls `trigger_webhooks(tenant_id, event, payload)` at each job state transition.
2. Celery task `deliver_webhook` POSTs signed payload to all matching registered URLs.
3. Signing: `X-ARIA-Signature: sha256={HMAC-SHA256(secret, timestamp + "." + body)}` + `X-ARIA-Timestamp`.
4. Retry: 3 attempts with exponential backoff (5s, 30s, 5min). After 3 failures, webhook is marked `disabled` and tenant is notified.
5. Delivery log persisted in `WebhookDeliveryORM` for audit and debugging.

**Payload schema (mirrors `JobStatusResponse`):**

```json
{
  "event": "job.completed",
  "api_version": "2026-05-24",
  "data": {
    "job_id": "uuid",
    "status": "COMPLETED",
    "summary": {
      "total_records": 48,
      "matched": 43,
      "uncertain": 3,
      "unmatched": 2,
      "total_value_myr": "142830.50",
      "processing_seconds": 38.2
    }
  },
  "created_at": "2026-05-24T10:15:30Z"
}
```

**Why HMAC signing over mutual TLS:**  
mTLS requires SMEs to manage client certificates — significant operational overhead for SME finance teams. HMAC-SHA256 signing (the Stripe model) requires only a shared secret string, is verifiable in any language with a standard library, and is well-understood by developers building integrations.

---

### AD-5: Enterprise Reference Frontend

#### Problem

The reference UI is optimised for a single interaction: upload files, watch one job, review results, export. It provides no visibility into the state of the continuous pipeline, does not show multiple jobs, and has no operational tooling (API key management, webhook registration, analytics).

#### Decision

Evolve the frontend from a **single-job workflow app** into an **enterprise operations dashboard** while preserving all existing pages.

#### Navigation Structure

Current: minimal top header with 4 routes.  
Target: collapsible sidebar with grouped navigation.

```
ARIA
├── Dashboard          /dashboard       ← NEW
├── Pipeline
│   ├── Transaction Queue  /queue       ← NEW
│   └── Jobs              /jobs         ← NEW (was implicit)
├── Reconciliation
│   ├── Upload            /upload       (existing)
│   ├── Job Detail        /jobs/:id     (existing, SSE-enhanced)
│   ├── Results           /jobs/:id/results  (existing)
│   └── Review Queue      /jobs/:id/review  (existing)
├── Analytics            /analytics    ← NEW
└── Settings
    ├── API Keys          /settings/keys    ← NEW
    └── Webhooks          /settings/webhooks ← NEW
```

#### New Screens

**Pipeline Dashboard (`/dashboard`)**

Purpose: operational situational awareness for finance managers and treasury operators.

Key elements:
- **KPI row:** Active jobs, jobs completed today, average match rate (7d), average processing time.
- **Status distribution chart:** Doughnut — matched / uncertain / unmatched — for last N jobs.
- **Throughput chart:** Line graph — jobs per hour over the last 24h.
- **Active jobs panel:** Live list of INGESTING / NORMALISING / MATCHING / REPORTING jobs with real-time progress bars (via SSE connections per job).
- **Recent completions:** Last 10 completed jobs with match rate and quick-link to results.

**Transaction Queue (`/queue`)**

Purpose: visibility into the ingestion buffer before auto-batching fires.

Key elements:
- **Per-corridor counters:** USD/MYR, EUR/MYR, GBP/MYR, SGD/MYR — buffered transaction count, oldest record timestamp.
- **Batch trigger preview:** Time until next scheduled batch (countdown) and count distance to threshold.
- **Manual flush:** "Batch Now" button — calls `POST /api/v1/ingest/queue/flush` to immediately trigger batching for this tenant.
- **Recent arrivals table:** Last 20 transactions received, status (BUFFERED → BATCHED), source identifier.

**Job Monitor (`/jobs`)**

Purpose: paginated list of all reconciliation jobs for this tenant.

Key elements:
- AG Grid with columns: Created, Status, Records, Matched, Uncertain, Processing Time, Actions.
- Filter bar: status, date range, corridor.
- Row actions: View Results, Export, Re-run (for FAILED jobs).
- Real-time status chip updates via polling (SSE not cost-effective for list views).

**Analytics (`/analytics`)**

Purpose: trend analysis for finance managers.

Key elements:
- Date range picker.
- Match precision over time (line chart — % auto-matched per day).
- FX corridor breakdown (bar chart — job volume per corridor).
- Escalation rate trend (line chart — % routed to review queue per day).
- Exception table — top reasons for UNMATCHED records (exportable CSV).

**API Keys (`/settings/keys`)**

Key elements:
- Table of active keys (label, created, last used, expiry).
- "Generate New Key" — modal with label input → shows key once with copy button.
- Revoke action with confirmation dialog.

**Webhooks (`/settings/webhooks`)**

Key elements:
- Table of registered webhooks (URL, events, status, last delivery).
- "Add Webhook" — form (URL, event filter checkboxes, label).
- "Test" — sends synthetic `job.completed` payload → shows delivery result.
- Delivery log accordion per webhook.

#### Frontend Architecture Changes

| Component | Change |
|-----------|--------|
| `AppShell.tsx` | Replace top header with collapsible sidebar nav |
| `useJobStatus.ts` | Retained as polling fallback |
| `useJobStream.ts` | New — `EventSource` wrapper with TanStack Query cache hydration |
| `tenant-store.ts` | New Zustand store — API key in session, tenant metadata |
| `ReconciliationGrid.tsx` | Unchanged |
| `ReviewDrawer.tsx` | Unchanged |
| All new screens | Follow existing Card / Button / StatusBadge / EmptyState patterns |

Charts use **Recharts** (already compatible with the React 18 + Tailwind stack; no AG Grid dependency for time-series visualisation).

---

## 5. Data Model Changes

All changes are **additive**. No existing columns are removed. Migrations are sequential and backward-compatible.

### New Tables

```sql
-- Migration 0002_tenants.py
CREATE TABLE tenants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_hash      TEXT NOT NULL UNIQUE,   -- SHA-256, indexed
    label         TEXT NOT NULL,
    last_used_at  TIMESTAMPTZ,
    expires_at    TIMESTAMPTZ,
    enabled       BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration 0003_tenant_scoping.py
ALTER TABLE jobs       ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE matches    ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);
ALTER TABLE audit_logs ADD COLUMN tenant_id UUID NOT NULL REFERENCES tenants(id);

CREATE INDEX idx_jobs_tenant       ON jobs(tenant_id);
CREATE INDEX idx_matches_tenant    ON matches(tenant_id);
CREATE INDEX idx_audit_tenant      ON audit_logs(tenant_id);

-- Migration 0004_ingestion_pipeline.py
CREATE TABLE transaction_buffer (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID NOT NULL REFERENCES tenants(id),
    payload      JSONB NOT NULL,         -- raw transaction data
    corridor     TEXT NOT NULL,          -- e.g. 'USD/MYR'
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    status       TEXT NOT NULL DEFAULT 'BUFFERED',  -- BUFFERED | BATCHED
    job_id       UUID REFERENCES jobs(id)           -- set when batched
);

CREATE INDEX idx_buffer_tenant_status ON transaction_buffer(tenant_id, status);
CREATE INDEX idx_buffer_received_at   ON transaction_buffer(received_at);

-- Migration 0005_webhooks.py
CREATE TABLE webhooks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    url         TEXT NOT NULL,
    events      JSONB NOT NULL,         -- ["job.completed", "job.failed", ...]
    secret_hash TEXT NOT NULL,          -- stored hashed; raw shown once
    label       TEXT,
    enabled     BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webhook_deliveries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id      UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    job_id          UUID NOT NULL REFERENCES jobs(id),
    event           TEXT NOT NULL,
    status          TEXT NOT NULL,   -- PENDING | SUCCESS | FAILED | DISABLED
    attempt_count   INT NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    response_code   INT,
    response_body   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Pydantic Schema Additions

```python
# backend/app/models/schemas.py (additions)

class TenantCreate(BaseModel):
    name: str

class TenantResponse(BaseModel):
    id: UUID
    name: str
    created_at: datetime

class ApiKeyCreate(BaseModel):
    label: str
    expires_at: Optional[datetime] = None

class ApiKeyResponse(BaseModel):
    id: UUID
    label: str
    last_used_at: Optional[datetime]
    expires_at: Optional[datetime]
    enabled: bool
    created_at: datetime
    key: Optional[str] = None  # Only populated on creation; never returned again

class TransactionIngestItem(BaseModel):
    payment_proof_b64: Optional[str] = None   # Base64-encoded document
    storage_key: Optional[str] = None          # Pre-uploaded MinIO key
    bank_entry: Optional[BankEntry] = None
    corridor: str                               # e.g. "USD/MYR"
    value_date: date

class TransactionIngestRequest(BaseModel):
    transactions: List[TransactionIngestItem]
    model_validator(mode='after')
    def validate_proof_source(self): ...        # Exactly one of b64 or storage_key

class QueueStatusResponse(BaseModel):
    tenant_id: UUID
    by_corridor: Dict[str, int]                # {"USD/MYR": 23, "EUR/MYR": 7}
    total_buffered: int
    oldest_received_at: Optional[datetime]
    next_batch_trigger: str                    # "count" | "time" | "both" | "none"

class WebhookCreate(BaseModel):
    url: HttpUrl
    events: List[str]
    label: Optional[str] = None

class WebhookResponse(BaseModel):
    id: UUID
    url: str
    events: List[str]
    label: Optional[str]
    enabled: bool
    created_at: datetime
    secret: Optional[str] = None  # Only on creation

class AnalyticsSummary(BaseModel):
    period_start: date
    period_end: date
    total_jobs: int
    total_records: int
    avg_match_rate: float
    avg_processing_seconds: float
    by_corridor: Dict[str, Dict[str, Any]]
    escalation_rate: float
```

---

## 6. API Contract

### Authentication

All endpoints (except `/health`, `/docs`, `/openapi.json`, and admin bootstrap) require:

```
X-API-Key: aria_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Admin-only endpoints additionally require:

```
X-Admin-Key: {ADMIN_API_KEY env var}
```

### Complete Endpoint Reference

#### Tenant Management (Admin)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/v1/tenants` | Create tenant |
| `GET` | `/api/v1/tenants` | List tenants |
| `POST` | `/api/v1/tenants/{tenant_id}/keys` | Generate API key |
| `GET` | `/api/v1/tenants/{tenant_id}/keys` | List keys |
| `DELETE` | `/api/v1/tenants/{tenant_id}/keys/{key_id}` | Revoke key |

#### Transaction Ingestion

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/v1/ingest/transactions` | Push transactions to buffer |
| `GET` | `/api/v1/ingest/queue` | View buffer status by corridor |
| `POST` | `/api/v1/ingest/queue/flush` | Manually trigger batching |

#### Jobs (Existing + Extended)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/v1/jobs` | Manual upload (multipart — unchanged) |
| `GET` | `/api/v1/jobs` | **NEW** List jobs (paginated, filterable) |
| `GET` | `/api/v1/jobs/{job_id}` | Poll status (unchanged) |
| `GET` | `/api/v1/jobs/{job_id}/stream` | **NEW** SSE stream |
| `GET` | `/api/v1/jobs/{job_id}/results` | Full report (unchanged) |
| `GET` | `/api/v1/jobs/{job_id}/review` | Review queue (unchanged) |
| `POST` | `/api/v1/jobs/{job_id}/review/{match_id}` | Human decision (unchanged) |
| `GET` | `/api/v1/jobs/{job_id}/export` | Excel download (unchanged) |

#### Webhooks

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/v1/webhooks` | Register webhook |
| `GET` | `/api/v1/webhooks` | List webhooks |
| `DELETE` | `/api/v1/webhooks/{id}` | Remove webhook |
| `POST` | `/api/v1/webhooks/{id}/test` | Send test event |
| `GET` | `/api/v1/webhooks/{id}/deliveries` | Delivery log |

#### Analytics

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/v1/analytics/summary` | Aggregate stats (date range, corridor) |

### SSE Event Schema

```
GET /api/v1/jobs/{job_id}/stream

data: {"event": "status_change", "status": "INGESTING", "progress_pct": 0, "timestamp": "..."}

data: {"event": "agent_complete", "agent": "ingestion", "duration_ms": 4200, "records_extracted": 47}

data: {"event": "agent_complete", "agent": "normalisation", "duration_ms": 1800}

data: {"event": "match_found", "match_id": "uuid", "status": "MATCHED", "confidence": 0.91}

data: {"event": "review_required", "uncertain_count": 3}

data: {"event": "completed", "summary": {"matched": 44, "uncertain": 3, "unmatched": 0}}
```

### Webhook Payload Schema

```json
POST https://your-erp.com/aria-webhook
X-ARIA-Signature: sha256=abc123...
X-ARIA-Timestamp: 1716547200
Content-Type: application/json

{
  "event": "job.completed",
  "api_version": "2026-05-24",
  "tenant_id": "uuid",
  "data": {
    "job_id": "uuid",
    "status": "COMPLETED",
    "created_at": "2026-05-24T10:00:00Z",
    "completed_at": "2026-05-24T10:00:38Z",
    "summary": {
      "total_records": 48,
      "matched": 45,
      "uncertain": 2,
      "unmatched": 1,
      "total_value_myr": "142830.50",
      "match_rate": 0.9375,
      "processing_seconds": 38.2
    }
  }
}
```

**Signature verification (Python example):**

```python
import hmac, hashlib, time

def verify_aria_webhook(payload: bytes, signature: str, timestamp: str, secret: str) -> bool:
    age = abs(time.time() - int(timestamp))
    if age > 300:  # 5-minute tolerance
        return False
    expected = hmac.new(
        secret.encode(),
        f"{timestamp}.{payload.decode()}".encode(),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)
```

---

## 7. Infrastructure Changes

### Docker Compose Additions

```yaml
# docker-compose.yml additions

services:
  # Existing services unchanged: postgres, redis, minio, api, frontend

  worker:
    # Existing Celery worker — unchanged

  beat:                              # NEW — Celery Beat scheduler
    build: ./backend
    command: celery -A app.workers.celery_app beat --loglevel=info
    environment: *api-env
    depends_on:
      redis: { condition: service_healthy }
      api:   { condition: service_healthy }
    restart: unless-stopped

  # Optional: Flower for Celery monitoring (development)
  flower:
    image: mher/flower:2.0
    ports: ["5555:5555"]
    environment:
      CELERY_BROKER_URL: redis://redis:6379/0
    depends_on: [redis]
    profiles: ["debug"]
```

### New Environment Variables

```bash
# .env.example additions

# Auth
ADMIN_API_KEY=                        # Bootstrap key for tenant/admin operations

# Ingestion pipeline
BATCH_SIZE_THRESHOLD=50               # Trigger batch when ≥ N buffered transactions
BATCH_TIME_WINDOW_MINUTES=15          # Trigger batch when oldest tx is ≥ N minutes old
CELERY_BEAT_INTERVAL_MINUTES=2        # Scheduler check frequency

# Webhooks
WEBHOOK_SIGNING_SECRET_SALT=          # Additional entropy for HMAC key derivation
WEBHOOK_MAX_RETRIES=3
WEBHOOK_RETRY_BACKOFF_BASE_SECONDS=5
```

---

## 8. Security Posture

### Authentication Hardening

| Control | Implementation |
|---------|---------------|
| Key storage | SHA-256 hash only; raw key shown once, never stored |
| Key rotation | `DELETE` + `POST` — old key revoked, new key issued atomically |
| Key expiry | Optional `expires_at`; expired keys return 401 |
| Rate limiting | Per-tenant request throttle via Redis sliding window (planned Phase 2) |
| Admin isolation | Admin key separate from tenant keys; enforced at middleware level |

### Tenant Data Isolation

- All SQL queries include `WHERE tenant_id = :tenant_id` enforced at the repository layer.
- MinIO object paths are `{tenant_id}/{...}`; the API never constructs paths from user input without prefix enforcement.
- Cross-tenant access is structurally impossible — the `tenant_id` comes from the authenticated API key, not from the request body.

### Webhook Security

- HMAC-SHA256 signatures on all deliveries (Stripe model).
- Timestamp included in signature to prevent replay attacks (5-minute window).
- Webhook secrets are hashed at rest; the raw secret is shown once at registration.
- Delivery to `localhost`, `169.254.*`, `10.*`, `172.16.*` ranges is blocked (SSRF prevention).

### Existing Controls (Unchanged)

- AES-256 encryption for documents at rest in MinIO.
- Presigned URLs expire in 15 minutes.
- PII masking in structured logs (`payer_name` masked at DEBUG level).
- LLM reasoning chains stored in audit log, never discarded.
- Items with confidence < 0.75 never auto-confirmed.

---

## 9. Implementation Roadmap

### Phase 1 — Multi-Tenancy & Auth (Foundation)

**Goal:** All existing functionality works under tenant isolation with API key authentication.

| Task | Scope |
|------|-------|
| Alembic migrations 0002–0003 (tenants, api_keys, tenant_id columns) | Backend |
| `TenantORM`, `ApiKeyORM` SQLAlchemy models | Backend |
| `APIKeyMiddleware` — validation, tenant injection, caching | Backend |
| Repository base class — `tenant_id` scoping on all queries | Backend |
| Admin endpoints — tenant + key CRUD | Backend |
| Pydantic schemas for tenant/key responses | Backend |
| `ADMIN_API_KEY` bootstrapping in Docker Compose | Infra |
| Update `docs/api-reference.md`, `docs/configuration.md` | Docs |
| Integration tests — auth 401/200, tenant isolation | Tests |

**Completion criteria:** Existing E2E tests pass with API key header; two tenants cannot see each other's jobs.

---

### Phase 2 — Ingestion Pipeline

**Goal:** External systems can push transactions; auto-batching creates jobs without human intervention.

| Task | Scope |
|------|-------|
| Alembic migration 0004 (transaction_buffer) | Backend |
| `TransactionBufferORM` model | Backend |
| `POST /api/v1/ingest/transactions` — validation, storage, buffer write | Backend |
| `GET /api/v1/ingest/queue` — status by corridor | Backend |
| `POST /api/v1/ingest/queue/flush` — manual trigger | Backend |
| `auto_batch_transactions` Celery task (dual-trigger logic) | Backend |
| Celery Beat configuration + Docker Compose `beat` service | Infra |
| New env vars in `.env.example` | Infra |
| Update `docs/architecture.md`, `docs/configuration.md` | Docs |
| Integration tests — buffer → batch → job creation | Tests |

**Completion criteria:** 50 transactions POSTed via API → Celery Beat fires → Job created → Pipeline runs → Results appear at `/api/v1/jobs/{id}/results`.

---

### Phase 3 — SSE Streaming

**Goal:** Job progress is pushed to clients; 2-second polling is eliminated from the primary path.

| Task | Scope |
|------|-------|
| Asyncio event queue in `pipeline_runner.py` | Backend |
| Event emission at each agent boundary | Backend |
| `GET /api/v1/jobs/{job_id}/stream` SSE endpoint | Backend |
| `useJobStream` hook — `EventSource` + TanStack Query cache hydration | Frontend |
| `JobProgressPage` migrated to SSE with polling fallback | Frontend |
| Update `docs/api-reference.md` | Docs |
| Integration tests — SSE event sequence per pipeline run | Tests |

**Completion criteria:** Network tab shows SSE connection; events appear at each agent boundary; polling is absent in the primary code path.

---

### Phase 4 — Webhooks

**Goal:** External systems receive push notifications on job state transitions.

| Task | Scope |
|------|-------|
| Alembic migration 0005 (webhooks, webhook_deliveries) | Backend |
| `WebhookORM`, `WebhookDeliveryORM` models | Backend |
| Webhook CRUD endpoints | Backend |
| `deliver_webhook` Celery task — HMAC signing, retry, delivery log | Backend |
| Hook `trigger_webhooks` into pipeline state transitions | Backend |
| `POST /api/v1/webhooks/{id}/test` endpoint | Backend |
| Update `docs/api-reference.md` | Docs |
| Integration tests — webhook delivery, retry, HMAC verification | Tests |

**Completion criteria:** Register `https://webhook.site` URL → complete a job → delivery appears in webhook.site within 5 seconds with valid HMAC signature.

---

### Phase 5 — Enterprise Frontend

**Goal:** Reference UI provides operational visibility for continuous pipeline management.

| Task | Scope |
|------|-------|
| `AppShell` refactor — collapsible sidebar nav | Frontend |
| `tenant-store.ts` Zustand store | Frontend |
| Pipeline Dashboard screen | Frontend |
| Transaction Queue screen | Frontend |
| Job Monitor screen (paginated job list) | Frontend |
| Analytics screen (Recharts time-series) | Frontend |
| API Keys settings screen | Frontend |
| Webhooks settings screen | Frontend |
| `JobProgressPage` updated to use `useJobStream` | Frontend |
| Component tests for all new screens | Tests |
| Update `docs/solution.md` with new screen documentation | Docs |

**Completion criteria:** All 5 new screens render correctly; Dashboard shows real jobs; Transaction Queue shows buffer state; job detail page uses SSE.

---

## 10. Success Metrics

The following metrics define success for the platform enhancement and should be tracked post-deployment.

| Metric | Target | Measurement |
|--------|--------|-------------|
| API request latency (p95) | < 200ms (non-pipeline) | Prometheus / structlog |
| Pipeline latency | < 60s for 50-transaction batch | `processing_seconds` in report |
| Auto-batch trigger accuracy | 100% of batches fired within 2× time window | Celery Beat task logs |
| SSE connection stability | < 1% dropped connections without reconnect | Frontend error boundary logs |
| Webhook delivery success rate | > 99% within 3 attempts | `webhook_deliveries` table |
| Tenant data isolation | 0 cross-tenant data leaks | Integration test suite |
| Match precision (confidence ≥ 0.75) | > 90% | `ReconciliationSummary.matched / total` |
| Escalation rate | 5–20% to human review | `uncertain / total` |

---

*This document supersedes ad-hoc architecture notes. Update it whenever a design decision in this document is revised during implementation.*
