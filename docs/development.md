---
title: Development
layout: default
description: "Testing, project conventions, and contribution guide"
---

# Development

{: .no_toc }

## Table of contents
{: .no_toc .text-delta }
1. TOC
{:toc}

---

## Development setup

For day-to-day work, use the **hybrid local development** flow in [Getting Started]({{ '/getting-started' | relative_url }}#option-2--hybrid-local-development):

- Docker: Postgres + Redis + MinIO
- Native: backend (uvicorn), Celery worker, frontend (Vite)

This gives hot reload on both backend and frontend without rebuilding containers.

### Celery on Windows

When running the worker natively on Windows (Option 2), always use the solo pool:

```bash
celery -A app.workers.celery_app:celery_app worker --loglevel=INFO --pool=solo
```

Restart the worker after changing `backend/.env` (settings are loaded at process start).

---

## Running tests

### Backend

```bash
cd backend
source .venv/bin/activate
pip install -e ".[dev]"

# Full suite
pytest -v

# Quiet run
pytest -q

# Skip slow integration tests
pytest -q -m "not slow"

# With coverage
pytest -v --cov=app
```

Tests use **SQLite**, **mock LLM**, **local filesystem storage**, and **inline Celery** — no Docker required.

Key test directories:

```text
backend/tests/
├── unit/           Config, models, services, tools
├── integration/    API endpoints, database, pipeline e2e
├── agents/         Agent node behaviour with mocked LLM
└── fixtures/       Sample proofs, bank statements, ground truth
```

### Frontend

```bash
cd frontend
npm install

# Unit + integration (Vitest)
npm test

# With coverage
npm run test:coverage

# Type check
npm run typecheck

# E2E (Playwright — starts Vite automatically)
npm run test:e2e:install   # one-time Chromium install
npm run test:e2e
```

E2E specs:

| Spec | Flow |
| --- | --- |
| `reconciliation-flow.spec.ts` | Upload → wait → results → export |
| `review-queue.spec.ts` | Confirm uncertain match |
| `error-states.spec.ts` | Invalid upload, failed job display |

---

## Database migrations

```bash
cd backend

# Apply all migrations
alembic upgrade head

# Create a new migration after model changes
alembic revision --autogenerate -m "describe change"

# Roll back one step
alembic downgrade -1
```

{: .important }
> In `development` and `test` environments, tables are also auto-created on API startup. **Production deployments must rely on Alembic only** — set `APP_ENV=production`.

---

## Code conventions

### Backend (Python)

| Rule | Detail |
| --- | --- |
| Python | 3.11+ |
| Types | Pydantic v2 at all API and state boundaries |
| Money | `Decimal` in Python; strings in JSON |
| Async | `async def` for I/O-bound handlers and services |
| Logging | structlog with JSON output; include `job_id` |
| LLM calls | Only from agent nodes — never from route handlers |
| Linting | `ruff` (see `pyproject.toml`) |

### Frontend (TypeScript)

| Rule | Detail |
| --- | --- |
| Mode | Strict TypeScript — no `any` |
| Components | Presentational; data fetching in pages/hooks |
| Server state | TanStack Query |
| UI state | Zustand (upload draft only) |
| Amounts | Preserve as decimal strings from API |

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(agents): add document ingestion agent with vision-first extraction
fix(matching): correct tolerance window for SWIFT charge deduction
test(api): add integration tests for job review endpoints
docs: add GitHub Pages documentation site
```

See `CLAUDE.md` §6 for full conventions.

---

## LLM modes

| Mode | Use case | Config |
| --- | --- | --- |
| `mock` | CI, local dev, demos without API cost | `LLM_MODE=mock` (default) |
| `live` | Real extraction and matching | `LLM_MODE=live` + `ANTHROPIC_API_KEY` |

Mock mode returns deterministic, schema-shaped responses from `backend/app/services/llm_client.py`. The full pipeline runs identically — only the intelligence layer changes.

**Live vision notes:** Image proofs (PNG/JPG) are sent to Claude as multimodal input. PNGs are downscaled and re-encoded as JPEG before upload — MIME type is detected from bytes, not the filename. PDF payment proofs use extracted text, not vision.

---

## Project layout reference

```text
Aria/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/v1/          jobs.py, review.py, export.py
│   │   ├── agents/          ingestion, normalisation, matching, report
│   │   ├── graph/           builder.py, routing.py, state.py
│   │   ├── models/          Pydantic schemas + SQLAlchemy ORM
│   │   ├── services/        fx_service, llm_client, storage, excel_export, report_hydration
│   │   ├── tools/           file_parsers, fx_tools, swift_tools
│   │   ├── workers/         celery_app.py, tasks.py
│   │   └── core/            config, database, logging, exceptions
│   ├── alembic/
│   ├── tests/
│   ├── pyproject.toml
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/           Upload, JobProgress, Results, Review
│   │   ├── components/
│   │   ├── api/             client.ts
│   │   ├── hooks/
│   │   └── types/           api.ts
│   ├── tests/
│   ├── package.json
│   ├── vite.config.ts
│   ├── nginx.conf
│   └── Dockerfile
├── docs/                    GitHub Pages site (this documentation)
├── docker-compose.yml
├── CLAUDE.md
├── PROJECT_OVERVIEW.md
└── ARIA_Technical_Specification.md
```

---

## Definition of done

A feature is complete when:

1. Implementation matches `ARIA_Technical_Specification.md`
2. Unit and integration tests pass
3. Backend and frontend types stay in sync
4. Agent decisions are audit-logged
5. UI meets accessibility guidelines in `CLAUDE.md` §4
6. No secrets committed; `.env.example` updated if new vars added
7. LangSmith trace visible for agent pipeline steps (when tracing enabled)

---

## Security checklist

Before opening a PR touching data or AI:

- [ ] No secrets in code or commits
- [ ] `.env.example` updated for new environment variables
- [ ] PII masked in log output
- [ ] Confidence &lt; 0.75 never auto-confirmed
- [ ] LLM reasoning chains stored in audit log
- [ ] Presigned URLs respect TTL

---

## Additional resources

| Document | Location | Purpose |
| --- | --- | --- |
| Technical specification | `ARIA_Technical_Specification.md` | Full agent design, data models, sprint plan |
| Project overview | `PROJECT_OVERVIEW.md` | Competition context, impact, innovation |
| Contributor guide | `CLAUDE.md` | AI assistant and developer conventions |
| Backend README | `backend/README.md` | Backend quick reference |
| Frontend README | `frontend/README.md` | Frontend routes and scripts |

---

## Getting help

1. Check [Getting Started — Troubleshooting]({{ '/getting-started' | relative_url }}#troubleshooting)
2. Inspect API logs: `docker compose logs api worker`
3. Open an issue on GitHub with job ID, environment, and relevant log excerpts (redact secrets)
