---
title: Configuration
layout: default
description: "Environment variables, API keys, and tuning parameters"
---

# Configuration

{: .no_toc }

## Table of contents
{: .no_toc .text-delta }
1. TOC
{:toc}

---

<div class="aria-options">
  <div class="aria-option">
    <p class="aria-option__tag">Default</p>
    <p class="aria-option__title">Mock mode</p>
    <p class="aria-option__desc">No API keys. Deterministic pipeline for dev and CI.</p>
    <code>LLM_MODE=mock</code>
  </div>
  <div class="aria-option">
    <p class="aria-option__tag">Live AI</p>
    <p class="aria-option__title">Claude extraction</p>
    <p class="aria-option__desc">Real multimodal extraction and matching reasoning.</p>
    <code>LLM_MODE=live + ANTHROPIC_API_KEY</code>
  </div>
  <div class="aria-option">
    <p class="aria-option__tag">Observability</p>
    <p class="aria-option__title">LangSmith traces</p>
    <p class="aria-option__desc">Agent pipeline visibility for demo and debugging.</p>
    <code>LANGSMITH_API_KEY + LANGSMITH_TRACING=true</code>
  </div>
</div>

## Environment files

| File | Used by | Purpose |
| --- | --- | --- |
| `backend/.env` | Local Python, hybrid dev | Full backend configuration (overrides repo root) |
| `backend/.env.example` | Template | Copy to `.env` — safe to commit |
| `frontend-novapay/.env` | NovaPay Vite dev | Port 5173 |
| `frontend-admin/.env` | Admin app Vite dev | Port 5174 |
| `frontend-tenant-mgmt/.env` | Mgmt app Vite dev | Port 5175 |
| `.env` (repo root) | Docker Compose; hybrid backend | Compose substitution; also loaded by backend when running locally |

{: .warning }
> Never commit `.env` files containing secrets. They are listed in `.gitignore`.

---

## Quick reference — all variables

Copy `backend/.env.example` to `backend/.env` and fill in values as needed.

### LLM

| Variable | Default | Description |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | *(empty)* | Anthropic API key — required when `LLM_MODE=live` |
| `LLM_MODE` | `mock` | `mock` = deterministic in-process responses; `live` = real Claude calls |
| `AGENTS_SDK_TRACING` | `false` | Enable OpenAI Agents SDK built-in tracing (optional; LangSmith also available) |
| `SONNET_MODEL` | `claude-sonnet-4-6` | Model for ingestion, matching, report |
| `HAIKU_MODEL` | `claude-haiku-4-5` | Model for normalisation tool-use |

### Observability (LangSmith)

| Variable | Default | Description |
| --- | --- | --- |
| `LANGSMITH_API_KEY` | *(empty)* | LangSmith API key for agent tracing |
| `LANGSMITH_PROJECT` | `aria` | Project name in LangSmith UI |
| `LANGSMITH_TRACING` | `true` in example | Set `true` to enable trace export |

### Database

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | `sqlite+aiosqlite:///./aria.db` | Async SQLAlchemy URL |

Examples:

```bash
# Docker / local Postgres
DATABASE_URL=postgresql+asyncpg://aria:aria@localhost:5432/aria

# Zero-infra SQLite
DATABASE_URL=sqlite+aiosqlite:///./aria.db
```

### Redis / Celery

| Variable | Default | Description |
| --- | --- | --- |
| `REDIS_URL` | `redis://localhost:6379/0` | General Redis connection |
| `CELERY_BROKER_URL` | `redis://localhost:6379/1` | Celery message broker |
| `CELERY_RESULT_BACKEND` | `redis://localhost:6379/2` | Celery result store |
| `CELERY_TASK_ALWAYS_EAGER` | *(unset)* | Set `1` to run tasks inline (tests) |

### Object storage (S3 / MinIO)

| Variable | Default | Description |
| --- | --- | --- |
| `S3_ENDPOINT` | `http://localhost:9000` | S3-compatible endpoint |
| `S3_ACCESS_KEY` | `ariaadmin` | Access key (matches Docker MinIO) |
| `S3_SECRET_KEY` | `ariaadmin` | Secret key |
| `S3_BUCKET` | `aria-documents` | Bucket name (auto-created on first upload) |
| `S3_REGION` | `us-east-1` | AWS region (required by boto3) |
| `S3_PRESIGN_TTL_SECONDS` | `900` | Presigned URL expiry (15 min) |
| `S3_SERVER_SIDE_ENCRYPTION` | *(unset)* | Set `AES256` on AWS S3; **leave unset** for Docker MinIO |

Local filesystem fallback (no MinIO):

```bash
S3_ENDPOINT=local://_uploads
```

### FX providers

| Variable | Default | Description |
| --- | --- | --- |
| `EXCHANGERATE_API_KEY` | *(empty)* | Primary FX provider ([ExchangeRate-API](https://www.exchangerate-api.com/)) |
| `OPENEXCHANGERATES_APP_ID` | *(empty)* | Fallback provider ([Open Exchange Rates](https://openexchangerates.org/)) |
| `FX_CACHE_TTL_SECONDS` | `3600` | In-memory FX cache TTL |

If both keys are empty, ARIA falls back to **static mid-market rates** for USD/EUR/GBP/SGD → MYR (sufficient for demo, not production).

### Reconciliation tuning

| Variable | Default | Description |
| --- | --- | --- |
| `BASE_CURRENCY` | `MYR` | Normalisation target currency |
| `FX_VARIANCE_BUFFER_PCT` | `0.015` | 1.5% FX spread buffer in tolerance window |
| `MATCH_CONFIDENCE_THRESHOLD` | `0.75` | Auto-match floor |
| `EXTRACTION_ESCALATION_THRESHOLD` | `0.5` | Route to review if avg extraction confidence below this |
| `DATE_WINDOW_DAYS` | `5` | ± days for date filter in matching |

### Auth & multi-tenancy

| Variable | Default | Description |
| --- | --- | --- |
| `ADMIN_API_KEY` | `aria-dev-admin` | Legacy bootstrap key for programmatic admin endpoints |
| `JWT_SECRET_KEY` | *(dev default in code)* | HS256 signing secret — **change in production** |
| `JWT_ALGORITHM` | `HS256` | JWT algorithm |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | Token lifetime (24h) |
| `DEFAULT_ADMIN_EMAIL` | `admin@aria.local` | Platform admin email for auto-seed |
| `DEFAULT_ADMIN_PASSWORD` | *(empty)* | If set, seeds admin user when `users` table is empty |

### Ingestion pipeline (Celery Beat)

| Variable | Default | Description |
| --- | --- | --- |
| `BATCH_SIZE_THRESHOLD` | `50` | Auto-create a job when buffer hits this many transactions |
| `BATCH_TIME_WINDOW_MINUTES` | `15` | Auto-create a job when oldest buffered transaction is ≥ N minutes old |
| `CELERY_BEAT_INTERVAL_MINUTES` | `2` | How often the Beat scheduler checks the buffer |

### Webhooks

| Variable | Default | Description |
| --- | --- | --- |
| `WEBHOOK_MAX_RETRIES` | `3` | Maximum delivery attempts per webhook event |
| `WEBHOOK_RETRY_BACKOFF_BASE_SECONDS` | `5` | Base delay for exponential backoff; attempt N waits `base × 2^(N-1)` seconds |

### Application

| Variable | Default | Description |
| --- | --- | --- |
| `APP_ENV` | `development` | `development` \| `test` \| `staging` \| `production` |
| `LOG_LEVEL` | `INFO` | structlog level |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Comma-separated allowed origins |

### Frontend (Vite)

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Direct API URL (production builds) |
| `VITE_API_PROXY_TARGET` | `http://localhost:8000` | Vite dev proxy target for `/api` |

In Docker production, nginx proxies `/api/` to the backend — the frontend bundle uses relative `/api` paths.

---

## Obtaining API keys

### Anthropic (required for live LLM)

1. Create an account at [console.anthropic.com](https://console.anthropic.com)
2. Add a payment method under **Billing**
3. Go to **Settings → API Keys → Create Key**
4. Copy the key (starts with `sk-ant-api03-...`) — shown once only
5. Set `ANTHROPIC_API_KEY` and `LLM_MODE=live`

### ExchangeRate-API (recommended for live FX)

1. Sign up at [app.exchangerate-api.com/sign-up](https://app.exchangerate-api.com/sign-up) (free tier, no credit card)
2. Verify your email
3. Copy the API key from the dashboard
4. Set `EXCHANGERATE_API_KEY`

Free tier: ~1,500 requests/month, daily rate updates, historical data included.

### Open Exchange Rates (optional FX fallback)

1. Sign up at [openexchangerates.org/signup](https://openexchangerates.org/signup)
2. Copy your **App ID** from the account dashboard
3. Set `OPENEXCHANGERATES_APP_ID`

### LangSmith (optional observability)

1. Sign up at [smith.langchain.com](https://smith.langchain.com)
2. Go to **Settings → API Keys → Create API Key**
3. Set `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT=aria`, `LANGSMITH_TRACING=true`
4. View traces at [smith.langchain.com](https://smith.langchain.com) after running jobs

---

## Configuration by run mode

### Mock mode (no keys)

```bash
LLM_MODE=mock
# Leave ANTHROPIC_API_KEY, FX keys, and LANGSMITH_API_KEY empty
```

### Live LLM only

```bash
LLM_MODE=live
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### Full production-like

```bash
LLM_MODE=live
ANTHROPIC_API_KEY=sk-ant-api03-...
EXCHANGERATE_API_KEY=...
OPENEXCHANGERATES_APP_ID=...
LANGSMITH_API_KEY=lsv2_pt_...
LANGSMITH_PROJECT=aria
LANGSMITH_TRACING=true
DATABASE_URL=postgresql+asyncpg://aria:aria@localhost:5432/aria
S3_ENDPOINT=http://localhost:9000
APP_ENV=production
```

---

## Docker Compose passthrough

The root `.env` file is read by Docker Compose for variable substitution. The following variables are wired into the `api`, `worker`, and `beat` services:

```yaml
ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
LLM_MODE: ${LLM_MODE:-mock}
ADMIN_API_KEY: ${ADMIN_API_KEY:-aria-dev-admin}
JWT_SECRET_KEY: ${JWT_SECRET_KEY:-aria-dev-jwt-secret-change-in-production}
DEFAULT_ADMIN_EMAIL: ${DEFAULT_ADMIN_EMAIL:-admin@aria.local}
DEFAULT_ADMIN_PASSWORD: ${DEFAULT_ADMIN_PASSWORD:-}
CORS_ORIGINS: http://localhost:5173,http://localhost:5174,http://localhost:5175
BATCH_SIZE_THRESHOLD: ${BATCH_SIZE_THRESHOLD:-50}
BATCH_TIME_WINDOW_MINUTES: ${BATCH_TIME_WINDOW_MINUTES:-15}
CELERY_BEAT_INTERVAL_MINUTES: ${CELERY_BEAT_INTERVAL_MINUTES:-2}
WEBHOOK_MAX_RETRIES: ${WEBHOOK_MAX_RETRIES:-3}
WEBHOOK_RETRY_BACKOFF_BASE_SECONDS: ${WEBHOOK_RETRY_BACKOFF_BASE_SECONDS:-5}
```

Copy `.env.example` → `.env` at the repo root to get started. For hybrid development, put the full configuration in `backend/.env` and run the API/worker locally.

---

## Confidence thresholds (hard requirements)

These values drive routing logic and should not be lowered in production without review:

| Level | Threshold | Action |
| --- | --- | --- |
| Field flag | &lt; 0.70 | Flag field in UI |
| Extraction escalation | &lt; 0.50 (record avg) | Route to human review queue |
| Match uncertain | 0.50 – 0.74 | Review queue; never auto-confirm |
| Match confident | ≥ 0.75 | Auto-match allowed |
| Match failed | &lt; 0.50 (all candidates) | Exception report |

See [Architecture]({{ '/architecture' | relative_url }}) for how these map to agent routing.
