# ARIA Backend

FastAPI + LangGraph reconciliation pipeline for cross-border SME payments.
See the project root for `CLAUDE.md`, the technical spec, and project overview.

## Quick start (local, no Docker)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

# Optional: use SQLite for a zero-infra run.
echo 'DATABASE_URL=sqlite+aiosqlite:///./aria.db' >> .env
echo 'S3_ENDPOINT=local://_uploads' >> .env

uvicorn app.main:app --reload
```

OpenAPI docs: <http://localhost:8000/docs>. Health: `GET /health`.

## With Docker (Postgres + Redis + MinIO + Celery worker)

```bash
docker compose up --build
```

Run a smoke test against the live stack:

```bash
curl -F "payment_proofs=@tests/fixtures/payment_proofs/usd_invoice.txt" \
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
alembic upgrade head        # apply
alembic revision -m "..."   # new migration
```

Dev/test environments auto-create tables on startup; production deployments
must run migrations explicitly.
