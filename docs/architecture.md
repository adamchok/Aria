---
title: Architecture
layout: default
description: "System design, agent pipeline, and technology stack"
---

# Architecture

{: .no_toc }

## Table of contents
{: .no_toc .text-delta }
1. TOC
{:toc}

---

## System overview

ARIA is an **AI-first reconciliation platform**. The LangGraph pipeline is the authoritative reconciliation engine; multiple SME frontends — custom-built or the reference UI — connect to it through an authenticated, multi-tenant API. Transactions flow in continuously from external systems, are automatically batched and queued, and the AI engine reconciles them without manual intervention.

```mermaid
flowchart TB
  subgraph clients [Clients]
    UI[ARIA Reference UI]
    SME[External SME Systems]
  end
  subgraph platform [Platform API — FastAPI]
    AUTH[APIKeyMiddleware]
    JOBS[Jobs API]
    INGEST[Ingest API]
    SSE[SSE Stream]
    WH[Webhooks]
    AN[Analytics]
  end
  subgraph workers [Worker Layer — Celery]
    WORKER[Pipeline Worker]
    BEAT[Beat Scheduler]
    WH_TASK[Webhook Delivery]
  end
  subgraph intelligence [Intelligence — LangGraph]
    LG[4-Agent Pipeline]
    LLM[Claude Sonnet / Haiku]
    FX[FX + SWIFT tools]
  end
  subgraph data [Data]
    PG[(PostgreSQL)]
    RD[(Redis)]
    S3[(MinIO S3)]
  end
  UI & SME -->|X-API-Key| AUTH
  AUTH --> JOBS & INGEST & SSE & WH & AN
  INGEST -->|buffer| PG
  BEAT -->|auto-batch| WORKER
  JOBS -->|enqueue| WORKER
  WORKER --> LG
  LG --> LLM & FX & PG & S3
  LG -->|SSE events| SSE
  LG -->|terminal events| WH_TASK
  WH_TASK -->|HMAC POST| SME
  WORKER --> RD
```

## Agent pipeline

Four specialised agents execute sequentially with shared typed state (`ReconciliationState`):

```mermaid
flowchart TD
  IN[Agent 1: Ingestion<br/>Sonnet · vision] --> NO[Agent 2: Normalisation<br/>Haiku · FX tools]
  NO --> MA[Agent 3: Matching<br/>Sonnet · fuzzy + LLM]
  MA --> RE[Agent 4: Report<br/>Sonnet · Excel export]
  IN -->|confidence &lt; 0.5| HR[Human review queue]
  HR --> RE
  MA -->|0.5 ≤ conf &lt; 0.75| HR
```

<div class="aria-pipeline">
  <span class="aria-pipeline__step aria-pipeline__step--active">Ingestion</span>
  <span class="aria-pipeline__step">Normalisation</span>
  <span class="aria-pipeline__step">Matching</span>
  <span class="aria-pipeline__step">Report</span>
</div>

### Agent responsibilities

| Agent | Model | Responsibility |
| --- | --- | --- |
| **Ingestion** | Sonnet (multimodal) | Extract `PaymentRecord` from images (vision), PDF/Excel/CSV (text); parse bank statements from XLSX, CSV, or PDF |
| **Normalisation** | Haiku | FX conversion to base currency; tolerance window calculation |
| **Matching** | Sonnet | FX-aware fuzzy match + confidence scoring + explanations |
| **Report** | Sonnet | Summary synthesis, exception narratives, Excel export |

### LangGraph routing

| From | To | Condition |
| --- | --- | --- |
| Ingestion | Normalisation | Records extracted; avg confidence ≥ 0.5 |
| Ingestion | Human review queue | No records or avg confidence &lt; 0.5 |
| Normalisation | Matching | Normalised records exist |
| Normalisation | Report | Nothing to match (empty report) |
| Matching | Report | Always |
| Report | END | Pipeline complete |

Implementation: `backend/app/graph/builder.py`, `backend/app/graph/routing.py`.

## Matching logic

### FX tolerance window

```python
# Inbound wire transfers: full SWIFT charge estimate applies.
# Payments under 1,000 units in source currency skip SWIFT deduction in the
# tolerance band (card / e-commerce debits). A 2.5% card FX markup is added
# to tolerance_high.
tolerance_low = (
    amount_myr_at_invoice_rate
    - charges_for_tolerance
    - FX_VARIANCE_BUFFER_PCT * amount_myr_at_invoice_rate
)

tolerance_high = (
    amount_myr_at_settlement_rate
    + FX_VARIANCE_BUFFER_PCT * amount_myr_at_settlement_rate
    + card_markup
)
```

Default `FX_VARIANCE_BUFFER_PCT = 0.015` (1.5%). Matching also scores payee names and foreign-currency amounts embedded in bank descriptions (e.g. `(USD 20.00)`).

### Composite confidence score

| Signal | Weight |
| --- | --- |
| Amount match | 0.40 |
| Date proximity | 0.20 |
| Reference similarity | 0.30 |
| Payer name | 0.10 |

### Three-stage matching

1. **Date filter** — ±5 days (configurable via `DATE_WINDOW_DAYS`)
2. **Amount filter** — within `[tolerance_low, tolerance_high]`
3. **LLM reasoning** — semantic match on reference, payer, residual variance

## Data flow

| Step | Actor | Input | Output | Est. latency |
| --- | --- | --- | --- | --- |
| 1. Upload | User / API | Proofs + bank statement | Job ID, S3 keys | &lt; 1 s |
| 2. Ingest | Agent 1 | Raw files | `List[PaymentRecord]` | 3–8 s / doc |
| 3. Normalise | Agent 2 | Records + FX API | `List[NormalisedRecord]` | 1–2 s / record |
| 4. Match | Agent 3 | Normalised + statement | `List[MatchResult]` | 2–5 s / match |
| 5. Report | Agent 4 | All match results | `ReconciliationReport` | 3–5 s |
| 6. Review | Human | UNCERTAIN items | Confirmed / rejected matches | Async; results re-hydrated from DB |

Jobs are processed asynchronously by a **Celery worker** backed by **Redis**. If Redis is unreachable, the API falls back to inline execution for developer convenience. On **Windows**, run the worker with `--pool=solo`.

## Core data models

```python
# Reconciliation
PaymentRecord        # Extracted payment: payer, amount, currency, date, confidence
NormalisedRecord     # MYR amounts at invoice/settlement rates + tolerance bounds
MatchResult          # Match status, confidence, variance, LLM explanation
ReconciliationReport # Summary stats + all match results + audit log
BankEntry            # Parsed row from bank statement

# Platform (multi-tenancy)
TenantORM            # Tenant: name, created_at
ApiKeyORM            # API key: tenant_id, key_hash (SHA-256), label, last_used_at, enabled
TransactionBufferORM # Inbound transactions staged before batching
WebhookORM           # Registered endpoint: url, events, secret_hash, enabled
WebhookDeliveryORM   # Delivery log: status, attempt_count, response_code
```

Pydantic schemas: `backend/app/models/schemas.py`. SQLAlchemy models: `backend/app/models/database.py`.

## Technology stack

### Backend

| Component | Technology |
| --- | --- |
| API | FastAPI (Python 3.11+, async) |
| Agents | LangGraph `StateGraph` |
| LLM | Anthropic Claude (Sonnet + Haiku) |
| Task queue | Celery + Redis |
| Database | PostgreSQL 16 (SQLAlchemy 2.x async) |
| Migrations | Alembic |
| Object storage | MinIO (S3-compatible, boto3) |
| File parsing | pdfplumber, openpyxl, Pillow |
| Logging | structlog (JSON) |
| Observability | LangSmith (optional) |

### Frontend

| Component | Technology |
| --- | --- |
| Framework | React 18 + TypeScript (strict) |
| Build | Vite |
| Styling | Tailwind CSS |
| Server state | TanStack Query + SSE (`useJobStream` hook; polling as fallback) |
| UI state | Zustand (`upload-store`, `tenant-store` for API key session) |
| Tables | AG Grid Community |
| Routing | React Router v6 |
| Production serve | nginx (Docker) with `/api` reverse proxy |

**Enterprise screens:** Pipeline Dashboard, Job Monitor, Transaction Queue, Analytics, API Keys, Webhooks settings — all reachable from the collapsible sidebar nav.

### Infrastructure (Docker Compose)

| Service | Image / build | Port | Role |
| --- | --- | --- | --- |
| `postgres` | postgres:16-alpine | 5432 | Primary database |
| `redis` | redis:7-alpine | 6379 | Celery broker + result backend |
| `minio` | minio/minio | 9000, 9001 | Object storage |
| `api` | `./backend` | 8000 | FastAPI REST |
| `worker` | `./backend` | — | Celery pipeline worker |
| `beat` | `./backend` | — | Celery Beat scheduler (auto-batching) |
| `frontend` | `./frontend` | 5173 → nginx:80 | React SPA |

## Security considerations

- **Authentication** — API keys validated via SHA-256 hash comparison; raw keys never stored
- **Multi-tenancy** — row-level isolation: all queries filter by `tenant_id`; MinIO object paths prefixed with `{tenant_id}/`
- **Webhook signing** — HMAC-SHA256 (Stripe model); 5-minute timestamp tolerance prevents replay
- **SSRF guard** — webhook URLs validated against a blocklist before registration (no private/loopback addresses)
- Documents stored encrypted at rest (AES-256 via S3/MinIO)
- Presigned URLs expire in 15 minutes (`S3_PRESIGN_TTL_SECONDS=900`)
- No payment PII in debug logs (payer names masked where applicable)
- Every LLM reasoning chain persisted in audit log
- Items below confidence 0.75 never auto-confirmed
- Secrets via environment variables only — never committed

## Repository map

```text
backend/
├── app/
│   ├── main.py              FastAPI entry + middleware wiring
│   ├── api/v1/              REST routes
│   │   ├── jobs.py          Job CRUD + list
│   │   ├── stream.py        SSE endpoint
│   │   ├── tenants.py       Tenant + API key management (admin)
│   │   ├── ingest.py        Transaction ingestion + queue
│   │   ├── webhooks.py      Webhook CRUD + test + deliveries
│   │   └── analytics.py     Summary analytics
│   ├── agents/              LangGraph node implementations
│   ├── graph/               StateGraph, routing, state model
│   ├── models/              Pydantic + SQLAlchemy models
│   ├── repositories/        DB access: job, tenant, ingest, webhook
│   ├── services/            FX, storage, LLM client, Excel export
│   ├── tools/               File parsers, FX/SWIFT tools
│   ├── workers/             Celery app, pipeline task, Beat, webhook delivery
│   └── core/                Config, security, middleware, logging, database
├── alembic/                 DB migrations (0001–0005)
└── tests/                   Unit, integration, agent tests

frontend/
├── src/
│   ├── pages/               Dashboard, Jobs, Queue, Analytics, ApiKeys, Webhooks,
│   │                        Upload, Progress, Results, Review
│   ├── components/          UI components + AppShell (sidebar nav)
│   ├── api/                 Typed fetch client (X-API-Key header injection)
│   ├── hooks/               useJobStatus, useJobStream, useReviewActions
│   ├── stores/              upload-store, tenant-store (API key session)
│   └── types/               Mirrors backend schemas
└── tests/                   Vitest + Playwright e2e
```

See [API Reference]({{ '/api-reference' | relative_url }}) for endpoints and [Getting Started]({{ '/getting-started' | relative_url }}) to run the stack.
