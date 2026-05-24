# ARIA Tenant Ops

Reconciliation operations app for finance officers — upload, job monitoring, results, and human review.

React 18 + TypeScript · Vite · Tailwind · TanStack Query · AG Grid · JWT auth.

**Port:** 5173

## Quick start

```bash
cd frontend-tenant-ops
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
| `npm test` | Vitest (unit + integration) |
| `npm run test:coverage` | Vitest with v8 coverage |
| `npm run test:e2e` | Playwright e2e — boots Vite, runs Chromium |
| `npm run test:e2e:install` | One-time Chromium install for Playwright |

## Routes

```
/login                      Sign in (tenant user JWT)
/dashboard                  Pipeline overview
/jobs                       Job list
/jobs/:id                   Live progress (SSE + polling fallback)
/jobs/:id/results           Reconciliation dashboard + Excel export
/jobs/:id/review            Human review queue (UNCERTAIN items)
/upload                     New reconciliation job
```

## Architecture notes

- **Auth** — `auth-store` persists JWT; `AuthRoute` guards all routes except `/login`
- **API client** — Bearer token injection; types in `src/types/api.ts`
- **State** — Zustand `upload-store` for upload draft; TanStack Query for server state
- **SSE** — `useJobStream` passes token via `?access_token=` on EventSource
- **Production** — nginx serves static bundle and reverse-proxies `/api/` (see `Dockerfile`, `nginx.conf`)

## Docker Compose

```bash
docker compose up --build frontend-ops
# → http://localhost:5173
```
