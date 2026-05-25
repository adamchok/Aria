# NovaPay

**Reference SME client** for the ARIA reconciliation platform. NovaPay simulates how an external finance system (ERP, treasury portal, or payment ops tool) integrates with ARIA **via the REST API** — not as part of ARIA's internal admin tooling.

Use NovaPay to demo end-to-end flows: JWT or API-key auth, transaction ingest, job monitoring (SSE), human review, and webhook-driven completion — the same surfaces a real integrator would build against `POST /api/v1/jobs`, `POST /api/v1/ingest/transactions`, and related endpoints.

React 18 + TypeScript · Vite · Tailwind · TanStack Query · AG Grid · JWT auth.

**Port:** 5173

## Relationship to ARIA

| App | Folder | Role |
| --- | --- | --- |
| **NovaPay** (`frontend-novapay`) | This app | External client simulation — consumes ARIA API |
| **Admin** (`frontend-admin`) | Platform operator UI | Tenants, users, cross-tenant views |
| **Tenant mgmt** (`frontend-tenant-mgmt`) | Tenant configuration | API keys, webhooks, bank accounts |

ARIA (`backend/`) is the platform. NovaPay is a **demo integrator** shipped in-repo so judges and developers can exercise the API without building a separate frontend.

## Quick start

```bash
cd frontend-novapay
npm install
cp .env.example .env
npm run dev          # → http://localhost:5173 (proxies /api to :8000)
```

Sign in with a **tenant user** account created in the Admin UI (`frontend-admin`).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server with `/api` proxy to FastAPI |
| `npm run build` | Type-check then production bundle in `dist/` |
| `npm run typecheck` | Strict TypeScript build, no emit |
| `npm test` | Vitest — auth, API client, route guard, hooks, page integration tests |
| `npm run test:coverage` | Vitest with v8 coverage |
| `npm run test:e2e` | Playwright e2e — boots Vite, runs Chromium |
| `npm run test:e2e:install` | One-time Chromium install for Playwright |

## Routes

```
/login                      Sign in (tenant user JWT — same as API Bearer auth)
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

- **Auth** — `auth-store` persists JWT; `AuthRoute` + `TenantRoleRoute` guard all routes except `/login`. Production integrators may use `X-API-Key` instead.
- **API client** — Bearer token injection; types in `src/types/api.ts` mirror ARIA OpenAPI schemas.
- **State** — Zustand `upload-store` for upload draft; TanStack Query for server state.
- **SSE** — `useJobStream` passes token via `?access_token=` on EventSource (same pattern as external clients).
- **Production** — nginx serves static bundle and reverse-proxies `/api/` (see `Dockerfile`, `nginx.conf`).

## Docker Compose

```bash
docker compose up --build frontend-novapay
# → http://localhost:5173
```
