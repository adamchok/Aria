---
title: Getting Started
layout: default
description: "Prerequisites, installation, and step-by-step local run instructions"
---

# Getting Started

{: .no_toc }

## Table of contents
{: .no_toc .text-delta }
1. TOC
{:toc}

---

Choose the run mode that fits your goal. All three paths support the full reconciliation pipeline in **mock LLM** mode without API keys.

<div class="aria-options">
  <div class="aria-option aria-option--recommended">
    <p class="aria-option__tag">Recommended</p>
    <p class="aria-option__title">Option 1 — Docker full stack</p>
    <p class="aria-option__desc">Postgres, Redis, MinIO, API, Celery worker, and React UI in one command.</p>
    <code>docker compose up --build</code>
  </div>
  <div class="aria-option">
    <p class="aria-option__tag">Developers</p>
    <p class="aria-option__title">Option 2 — Hybrid local</p>
    <p class="aria-option__desc">Infra in Docker; backend and frontend with hot reload.</p>
    <code>uvicorn + celery + npm run dev</code>
  </div>
  <div class="aria-option">
    <p class="aria-option__tag">Fastest</p>
    <p class="aria-option__title">Option 3 — Zero infra</p>
    <p class="aria-option__desc">SQLite + local storage; API only, jobs run inline.</p>
    <code>uvicorn app.main:app --reload</code>
  </div>
</div>

## Prerequisites

| Tool | Version | Required for |
| --- | --- | --- |
| **Docker Desktop** | Latest | Recommended full stack |
| **Git** | Any recent | Clone the repository |
| **Python** | 3.11+ | Local backend development |
| **Node.js** | 18+ | Local frontend development |
| **curl** | Any | Smoke tests (optional) |

{: .important }
> **Windows users:** Docker Desktop and Git Bash (or WSL2) are recommended. Ensure ports **5432**, **6379**, **8000**, **5173**, **9000**, and **9001** are free before starting.

---

## Option 1 — Full stack with Docker (recommended)

Runs PostgreSQL, Redis, MinIO, FastAPI, Celery pipeline worker, Celery Beat scheduler (auto-batching), and three React frontend apps. Uses **mock LLM** by default — no Anthropic API keys required.

### Step 1: Clone the repository

```bash
git clone https://github.com/adamchok/Aria.git
cd Aria
```

### Step 2: Configure environment

Copy the example file and edit as needed:

```bash
cp .env.example .env
```

At minimum, configure admin bootstrap credentials so you can sign in to the UI:

```bash
DEFAULT_ADMIN_PASSWORD=choose-a-strong-password
```

Optionally enable live AI:

```bash
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
LLM_MODE=live
```

The legacy `ADMIN_API_KEY` (default `aria-dev-admin`) still works for programmatic admin endpoints (`/api/v1/tenants`) via the `X-API-Key` header. Change it in any non-local environment.

Skip Anthropic configuration entirely to stay in mock mode — the full pipeline runs with deterministic fixture responses. **UI and API access always require JWT or a tenant API key.**

### Step 3: Start all services

```bash
docker compose up --build
```

Wait until all health checks pass and you see the API listening on port 8000.

### Step 4: Open the application

| Service | URL | Credentials |
| --- | --- | --- |
| **NovaPay** (reference client) | [http://localhost:5173](http://localhost:5173) | Tenant user JWT (see Step 5) |
| **Admin UI** | [http://localhost:5174](http://localhost:5174) | `DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` |
| **Tenant mgmt UI** | [http://localhost:5175](http://localhost:5175) | Tenant user JWT |
| **API Swagger** | [http://localhost:8000/docs](http://localhost:8000/docs) | — |
| **Health check** | [http://localhost:8000/health](http://localhost:8000/health) | — |
| **MinIO console** | [http://localhost:9001](http://localhost:9001) | ariaadmin / ariaadmin |

### Step 5: First login and tenant setup

1. Open the **Admin UI** at [http://localhost:5174/login](http://localhost:5174/login)
2. Sign in with `DEFAULT_ADMIN_EMAIL` (default `admin@aria.local`) and your `DEFAULT_ADMIN_PASSWORD`
3. Create a **tenant** (Tenants → New tenant)
4. Create a **tenant user** assigned to that tenant (Users → New user, role `tenant_user`)
5. Sign in to **NovaPay** (:5173) or **Tenant mgmt** (:5175) with the tenant user credentials

Optional: create a programmatic **API key** in Tenant mgmt → Keys for curl/SDK integrations (`X-API-Key` header).

### Step 6: Run a reconciliation in the UI

1. In **NovaPay**, navigate to [http://localhost:5173/upload](http://localhost:5173/upload)
2. Upload one or more payment proof files (JPEG, PNG, PDF, XLSX, or CSV)
3. Upload a bank statement (XLSX, CSV, or PDF)
4. Confirm base currency is **MYR**
5. Click **Start Reconciliation**
6. Watch progress on the job page — results appear when complete
7. Open **Results** for the dashboard; open **Review** if uncertain items exist
8. Click **Export** to download the Excel report

### Step 7: Smoke test via curl (optional)

From the repository root, with the stack running. Replace `YOUR_JWT` with a token from login, or use `X-API-Key: aria_live_...` from Tenant mgmt → Keys.

```bash
# Obtain JWT (tenant user or admin)
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}' | jq -r .access_token)

curl -H "Authorization: Bearer $TOKEN" \
     -F "payment_proofs=@backend/tests/fixtures/payment_proofs/usd_invoice.txt" \
     -F "bank_statement=@backend/tests/fixtures/bank_statements/may_2026.csv" \
     -F "base_currency=MYR" \
     http://localhost:8000/api/v1/jobs
```

Copy the `job_id` from the response, then poll:

```bash
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:8000/api/v1/jobs/YOUR_JOB_ID
```

When `status` is terminal (`COMPLETED`, `AWAITING_REVIEW`, or `FAILED`), fetch results:

```bash
curl -H "Authorization: Bearer $TOKEN" \
     http://localhost:8000/api/v1/jobs/YOUR_JOB_ID/results
```

### Step 8: Stop the stack

Press `Ctrl+C` in the terminal, then:

```bash
docker compose down
```

Add `-v` to remove persisted Postgres and MinIO volumes.

---

## Option 2 — Hybrid local development

Best for active development: infrastructure in Docker, backend and frontend run natively with hot reload.

### Step 1: Start infrastructure only

```bash
docker compose up postgres redis minio -d
```

### Step 2: Set up the backend

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:

```bash
# macOS / Linux / Git Bash
source .venv/bin/activate

# Windows PowerShell
.venv\Scripts\Activate.ps1

# Windows CMD
.venv\Scripts\activate.bat
```

Install dependencies and configure environment:

```bash
pip install -e ".[dev]"
cp .env.example .env
```

The default `backend/.env` points at `localhost` for Postgres, Redis, and MinIO — matching the Docker infra from Step 1.

Apply database migrations and start the API:

```bash
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Step 3: Start the Celery worker

In a **second terminal** (same venv):

```bash
cd backend
source .venv/bin/activate   # or Windows equivalent
celery -A app.workers.celery_app:celery_app worker --loglevel=INFO --pool=solo
```

{: .important }
> **Windows (Git Bash / hybrid dev):** Use `--pool=solo`. The default prefork pool fails on Windows (`WinError 5`), and the threads pool can conflict with async database drivers.

{: .warning }
> Without the Celery worker, jobs are enqueued but not processed unless Redis is down (in which case the API runs the pipeline inline as a fallback).

### Step 4: Start the frontend apps

In **three terminals** (hybrid dev):

```bash
cd frontend-novapay && npm install && cp .env.example .env && npm run dev   # :5173
cd frontend-tenant-mgmt && npm install && cp .env.example .env && npm run dev  # :5175
cd frontend-admin && npm install && cp .env.example .env && npm run dev        # :5174
```

Set `DEFAULT_ADMIN_PASSWORD` in `backend/.env`, restart API, then sign in to the admin app with `DEFAULT_ADMIN_EMAIL` / password. Create a tenant and tenant user from the admin console before using ops/mgmt apps.

Open http://localhost:5173 (NovaPay), http://localhost:5175 (mgmt), http://localhost:5174 (admin). Each app proxies `/api` to `http://localhost:8000`.

### Step 5: Verify the dev stack

| Check | Expected |
| --- | --- |
| [http://localhost:8000/health](http://localhost:8000/health) | `{"status":"ok",...}` |
| [http://localhost:8000/docs](http://localhost:8000/docs) | Swagger UI loads |
| [http://localhost:5173/upload](http://localhost:5173/upload) | NovaPay upload page renders (after tenant user login) |
| Celery worker logs | `celery@... ready` |

---

## Option 3 — Zero-infra backend only

Fastest way to explore the API without Docker. Uses SQLite and local filesystem storage.

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
```

Append to `backend/.env`:

```bash
DATABASE_URL=sqlite+aiosqlite:///./aria.db
S3_ENDPOINT=local://_uploads
LLM_MODE=mock
```

Start the API:

```bash
uvicorn app.main:app --reload
```

Jobs run **inline** (no Redis/Celery required). Open [http://localhost:8000/docs](http://localhost:8000/docs) to interact with the API directly.

Set `DEFAULT_ADMIN_PASSWORD` in `backend/.env`, restart the API, then call `POST /api/v1/auth/login` before other endpoints. Alternatively use a tenant API key via `X-API-Key`.

---

## Production-like setup (live LLM + FX + LangSmith)

For real Claude extraction, live FX rates, and agent tracing, configure API keys in `backend/.env`:

```bash
LLM_MODE=live
ANTHROPIC_API_KEY=sk-ant-api03-...

EXCHANGERATE_API_KEY=your-exchangerate-api-key
OPENEXCHANGERATES_APP_ID=your-openexchangerates-app-id

LANGSMITH_API_KEY=lsv2_pt_...
LANGSMITH_PROJECT=aria
LANGSMITH_TRACING=true
```

See [Configuration]({% link configuration.md %}) for where to obtain each key and full variable reference.

{: .important }
> When running via Docker Compose, only `ANTHROPIC_API_KEY` and `LLM_MODE` are passed to containers today. For FX and LangSmith in Docker, either use **Option 2 (hybrid)** with `backend/.env`, or add the variables to `docker-compose.yml` under the `api` and `worker` services.

---

## Enable GitHub Pages documentation

To publish this documentation site:

1. Push the `docs/` folder to your default branch
2. Go to **Repository Settings → Pages**
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**
4. Select branch **master** and folder **/docs**
5. Save — the site will be available at `https://<user>.github.io/<repo>/`

Update `baseurl` and `gh_edit_repository` in `docs/_config.yml` to match your repository name.

Local preview (optional):

```bash
cd docs
bundle install
bundle exec jekyll serve --livereload
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Job stuck at `PENDING` / `RUNNING` | Celery worker not running | Start worker (Option 2 Step 3) with `--pool=solo` on Windows |
| Celery `WinError 5` on Windows | Prefork pool unsupported | Add `--pool=solo` to the worker command |
| `Event loop is closed` in Celery (Windows) | Threads pool + asyncpg | Use `--pool=solo`; restart worker after code changes |
| Results unchanged after review | Stale browser cache / old API | Refresh results page; ensure uvicorn was restarted after backend updates |
| `502` on upload | MinIO not ready | Wait for health checks; verify port 9000 |
| MinIO upload / SSE error | `AES256` set against Docker MinIO | Leave `S3_SERVER_SIDE_ENCRYPTION` unset in `backend/.env` |
| LLM `image/png` vs `image/jpeg` error | PNG re-encoded as JPEG before vision call | Fixed in current backend — restart Celery worker |
| CORS error from frontend | Origin not allowed | Add your dev URL to `CORS_ORIGINS` in `backend/.env` |
| LLM errors with `LLM_MODE=live` | Missing/invalid Anthropic key | Set `ANTHROPIC_API_KEY`; check billing at console.anthropic.com |
| Port already in use | Conflicting local service | Stop other Postgres/Redis instances or change compose ports |
| Frontend shows API errors in Docker | nginx proxy misconfigured | Ensure `api` service is healthy; check `docker compose logs api` |

---

## Next steps

- [Configuration]({{ '/configuration' | relative_url }}) — full environment variable reference
- [API Reference]({{ '/api-reference' | relative_url }}) — REST endpoints and job lifecycle
- [Development]({{ '/development' | relative_url }}) — running tests and contributing
