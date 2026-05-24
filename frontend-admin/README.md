# ARIA Frontend

React 18 + TypeScript SPA for ARIA. Vite, Tailwind, TanStack Query,
Zustand, and AG Grid Community per `CLAUDE.md` §3.3.

## Quick start

```bash
cd frontend
npm install
cp .env.example .env
npm run dev          # → http://localhost:5173 (proxies /api to :8000)
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server with `/api` proxy to FastAPI |
| `npm run build` | Type-check then produce a production bundle in `dist/` |
| `npm run typecheck` | Strict TypeScript build, no emit |
| `npm test` | Vitest (unit + integration) — 49 specs |
| `npm run test:coverage` | Vitest with v8 coverage |
| `npm run test:e2e` | Playwright e2e — boots Vite, runs Chromium |
| `npm run test:e2e:install` | One-time Chromium install for Playwright |

## Routes

```
/upload                     New reconciliation job
/jobs/:id                   Live progress (polls every 2s until terminal)
/jobs/:id/results           Dashboard with AG Grid + Excel export
/jobs/:id/review            Human review queue for UNCERTAIN items
```

## Architecture notes

- **API client** (`src/api/client.ts`) — Fetch-based, typed against the
  backend Pydantic schemas in `src/types/api.ts`. Monetary values are
  preserved as Decimal strings.
- **State** — Zustand store for the upload draft; TanStack Query for all
  server state with optimistic updates on review actions.
- **Polling** — `useJobStatus` polls every 2s until the job hits a
  terminal status (COMPLETED / AWAITING_REVIEW / FAILED).
- **Tests** — MSW intercepts `fetch`; jsdom URL is pinned to
  `http://localhost/` so handlers and requests share an origin.
- **Build** — Vite emits a static bundle served by nginx in production;
  see `Dockerfile` and `nginx.conf`. nginx reverse-proxies `/api/` to the
  backend container.

## Production via Docker Compose

```bash
docker compose up --build      # api + worker + postgres + redis + minio + frontend
# → frontend on http://localhost:5173
```
