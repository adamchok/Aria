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

Runs PostgreSQL, Redis, MinIO, FastAPI, Celery worker, and the React frontend. Uses **mock LLM** by default — no API keys required.

### Step 1: Clone the repository

```bash
git clone https://github.com/adamchok/Aria.git
cd Aria
```

### Step 2: (Optional) Configure live LLM

Create a `.env` file at the **repository root** (same directory as `docker-compose.yml`):

```bash
# c:\Projects\Aria\.env  (Windows)
# ./.env                 (macOS / Linux)

ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
LLM_MODE=live
```

Skip this step to stay in mock mode — the pipeline still runs end-to-end with deterministic responses.

### Step 3: Start all services

```bash
docker compose up --build
```

Wait until all health checks pass and you see the API listening on port 8000.

### Step 4: Open the application

| Service | URL | Credentials |
| --- | --- | --- |
| **Web UI** | [http://localhost:5173](http://localhost:5173) | — |
| **API Swagger** | [http://localhost:8000/docs](http://localhost:8000/docs) | — |
| **Health check** | [http://localhost:8000/health](http://localhost:8000/health) | — |
| **MinIO console** | [http://localhost:9001](http://localhost:9001) | ariaadmin / ariaadmin |

### Step 5: Run a reconciliation in the UI

1. Navigate to [http://localhost:5173/upload](http://localhost:5173/upload)
2. Upload one or more payment proof files (JPEG, PNG, PDF, XLSX, or CSV)
3. Upload a bank statement (XLSX or CSV)
4. Confirm base currency is **MYR**
5. Click **Start Reconciliation**
6. Watch progress on the job page — results appear when complete
7. Open **Results** for the dashboard; open **Review** if uncertain items exist
8. Click **Export** to download the Excel report

### Step 6: Smoke test via curl (optional)

From the repository root, with the stack running:

```bash
curl -F "payment_proofs=@backend/tests/fixtures/payment_proofs/usd_invoice.txt" \
     -F "bank_statement=@backend/tests/fixtures/bank_statements/may_2026.csv" \
     -F "base_currency=MYR" \
     http://localhost:8000/api/v1/jobs
```

Copy the `job_id` from the response, then poll:

```bash
curl http://localhost:8000/api/v1/jobs/YOUR_JOB_ID
```

When `status` is terminal (`COMPLETED`, `AWAITING_REVIEW`, or `FAILED`), fetch results:

```bash
curl http://localhost:8000/api/v1/jobs/YOUR_JOB_ID/results
```

### Step 7: Stop the stack

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
celery -A app.workers.celery_app:celery_app worker --loglevel=INFO
```

{: .warning }
> Without the Celery worker, jobs are enqueued but not processed unless Redis is down (in which case the API runs the pipeline inline as a fallback).

### Step 4: Start the frontend

In a **third terminal**:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Vite proxies `/api` requests to `http://localhost:8000`.

### Step 5: Verify the dev stack

| Check | Expected |
| --- | --- |
| [http://localhost:8000/health](http://localhost:8000/health) | `{"status":"ok",...}` |
| [http://localhost:8000/docs](http://localhost:8000/docs) | Swagger UI loads |
| [http://localhost:5173/upload](http://localhost:5173/upload) | Upload page renders |
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
| Job stuck at `PENDING` / `RUNNING` | Celery worker not running | Start worker (Option 2 Step 3) or use full Docker stack |
| `502` on upload | MinIO not ready | Wait for health checks; verify port 9000 |
| CORS error from frontend | Origin not allowed | Add your dev URL to `CORS_ORIGINS` in `backend/.env` |
| LLM errors with `LLM_MODE=live` | Missing/invalid Anthropic key | Set `ANTHROPIC_API_KEY`; check billing at console.anthropic.com |
| Port already in use | Conflicting local service | Stop other Postgres/Redis instances or change compose ports |
| Frontend shows API errors in Docker | nginx proxy misconfigured | Ensure `api` service is healthy; check `docker compose logs api` |

---

## Next steps

- [Configuration]({{ '/configuration' | relative_url }}) — full environment variable reference
- [API Reference]({{ '/api-reference' | relative_url }}) — REST endpoints and job lifecycle
- [Development]({{ '/development' | relative_url }}) — running tests and contributing
