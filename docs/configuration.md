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
| `backend/.env` | Local Python, hybrid dev | Full backend configuration |
| `backend/.env.example` | Template | Copy to `.env` — safe to commit |
| `frontend/.env` | Vite dev server | API proxy target |
| `frontend/.env.example` | Template | Copy to `.env` |
| `.env` (repo root) | Docker Compose | Passes vars to `api` and `worker` containers |

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

The root `.env` file is read by Docker Compose for variable substitution. Currently wired:

```yaml
ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
LLM_MODE: ${LLM_MODE:-mock}
```

For hybrid development, put the full configuration in `backend/.env` and run the API/worker locally. To pass additional variables through Docker, add them under `environment:` for both `api` and `worker` services in `docker-compose.yml`.

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
