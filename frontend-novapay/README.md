# NovaPay

**Reference SME client** for the ARIA reconciliation platform. NovaPay simulates how an external finance system (ERP, treasury portal, or payment ops tool) integrates with ARIA **via the REST API** — not as part of ARIA's internal admin tooling.

Use NovaPay to demo end-to-end flows: **tenant API-key auth** (`X-API-Key`), transaction ingest, job monitoring (SSE via `?api_key=`), human review, and webhook-driven completion — the same surfaces a real integrator would build against `POST /api/v1/jobs`, `POST /api/v1/ingest/transactions`, and related endpoints.

React 18 + TypeScript · Vite · Tailwind · TanStack Query · AG Grid · **`X-API-Key` API auth** (demo UI login gate only).

**Port:** 5173

## Relationship to ARIA

| App | Folder | Role | API auth |
| --- | --- | --- | --- |
| **NovaPay** (`frontend-novapay`) | This app | External client simulation — consumes ARIA API | `X-API-Key` (`VITE_API_KEY`) |
| **Admin** (`frontend-admin`) | Platform operator UI | Tenants, users, cross-tenant views | JWT Bearer |
| **Tenant mgmt** (`frontend-tenant-mgmt`) | Tenant configuration | API keys, webhooks, bank accounts | JWT Bearer |

ARIA (`backend/`) is the platform. NovaPay is a **demo integrator** shipped in-repo so judges and developers can exercise the API without building a separate frontend.

## Quick start

```bash
cd frontend-novapay
npm install
cp .env.example .env
# Set VITE_API_KEY=aria_… (create key in Tenant mgmt → /keys)
npm run dev          # → http://localhost:5173 (proxies /api to :8000)
```

Sign in with **demo UI credentials** (`finance@novapay.demo` / `novapay2026`). This is a local UX gate only — **no JWT is issued** and all API requests use `X-API-Key`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server with `/api` proxy to FastAPI |
| `npm run build` | Type-check then production bundle in `dist/` |
| `npm run typecheck` | Strict TypeScript build, no emit |
| `npm test` | Vitest — API client, route guard, hooks, page integration tests |
| `npm run test:coverage` | Vitest with v8 coverage |
| `npm run test:e2e` | Playwright e2e — boots Vite, runs Chromium |
| `npm run test:e2e:install` | One-time Chromium install for Playwright |

## Routes

```
/login                      Demo UI sign-in (no backend auth call)
/dashboard                  Pipeline overview
/jobs                       Job list
/jobs/:id                   Live progress (SSE + polling fallback)
/jobs/:id/results           Reconciliation dashboard + Excel export
/jobs/:id/review            Human review queue (UNCERTAIN items)
/upload                     New reconciliation job (manual UI upload flow)
/ingest                     Simulate POST /api/v1/ingest/transactions
/queue                      Ingest buffer status and manual flush
/bank-accounts              Register accounts and ledger (bank data for jobs)
/bank-accounts/:id          Account detail, statements, ledger
```

## Architecture notes

- **Auth** — `auth-store` persists a local `isLoggedIn` flag for the demo UI gate. **`api/client.ts` sends `X-API-Key` on every request** from `VITE_API_KEY`. NovaPay does **not** use JWT Bearer.
- **API client** — types in `src/types/api.ts` mirror ARIA OpenAPI schemas.
- **State** — Zustand `upload-store` for upload draft; TanStack Query for server state.
- **SSE** — `useJobStream` passes the tenant key via `?api_key=` on `EventSource` (headers are not available on SSE).
- **Production** — nginx serves static bundle and reverse-proxies `/api/` (see `Dockerfile`, `nginx.conf`). Docker build bakes in `VITE_API_KEY` from repo-root `.env`.

## Docker Compose

```bash
# Set VITE_API_KEY in repo-root .env first, then:
docker compose up --build frontend-novapay
# → http://localhost:5173
```
