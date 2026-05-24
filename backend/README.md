# ARIA Backend

FastAPI + LangGraph reconciliation pipeline for cross-border SME payments.
See the project root for `CLAUDE.md`, the technical spec, and project overview.

## Quick start (local, no Docker)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

# Seed platform admin (required for UI login)
# Set DEFAULT_ADMIN_PASSWORD in .env

# Optional: use SQLite for a zero-infra run.
echo 'DATABASE_URL=sqlite+aiosqlite:///./aria.db' >> .env
echo 'S3_ENDPOINT=local://_uploads' >> .env

alembic upgrade head
uvicorn app.main:app --reload
```

OpenAPI docs: <http://localhost:8000/docs>. Health: `GET /health`.

## Authentication

All `/api/v1/*` routes (except `/auth/login`) require either:

- **JWT** — `Authorization: Bearer <token>` from `POST /api/v1/auth/login`
- **API key** — `X-API-Key: aria_live_...` (tenant key) or `ADMIN_API_KEY` (admin bootstrap)

## With Docker (Postgres + Redis + MinIO + Celery worker)

```bash
cp .env.example .env
# Set DEFAULT_ADMIN_PASSWORD in .env
docker compose up --build
```

Smoke test (after login or with a tenant API key):

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}' | jq -r .access_token)

curl -H "Authorization: Bearer $TOKEN" \
     -F "payment_proofs=@tests/fixtures/payment_proofs/usd_invoice.txt" \
     -F "bank_statement=@tests/fixtures/bank_statements/may_2026.csv" \
     -F "base_currency=MYR" \
     http://localhost:8000/api/v1/jobs
```

## LLM modes

`LLM_MODE=mock` (default) uses deterministic, in-process responses — no
Anthropic credits consumed. Set `LLM_MODE=live` + `ANTHROPIC_API_KEY` for
real extraction.

## Tests

```bash
cd backend
pytest -q
```

Use `-m "not slow"` to skip the full-pipeline integration test.

## Migrations

```bash
alembic upgrade head        # apply (0001–0008)
alembic revision -m "..."     # new migration
```

Dev/test environments auto-create tables on startup; production deployments
must run migrations explicitly.
