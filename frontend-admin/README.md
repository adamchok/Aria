# ARIA Platform Admin

Platform administration app — tenants, users, cross-tenant analytics, and ingest queue management.

React 18 + TypeScript · Vite · Tailwind · TanStack Query · JWT auth (admin role only).

**Port:** 5174

## Quick start

```bash
cd frontend-admin
npm install
cp .env.example .env
npm run dev          # → http://localhost:5174
```

Sign in with the seeded platform admin (`DEFAULT_ADMIN_EMAIL` / `DEFAULT_ADMIN_PASSWORD` in backend `.env`).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server with `/api` proxy |
| `npm run build` | Type-check + production bundle |
| `npm run typecheck` | Strict TypeScript |
| `npm test` | Vitest — auth, API client, and admin page integration tests |

## Routes

```
/login                      Sign in (platform admin)
/tenants                    List and create tenants
/tenants/:tenantId          Tenant detail + admin API keys
/users                      Create/list platform and tenant users
/analytics                  Cross-tenant reconciliation statistics
/queue                      All tenants' ingest buffer status + flush
```

## Architecture notes

- **Auth** — `AdminRoleRoute` rejects non-admin JWT roles
- **API client** — Admin endpoints under `/api/v1/tenants`, `/api/v1/users`, `/api/v1/analytics/admin/*`, `/api/v1/ingest/admin/*`

## Docker Compose

```bash
docker compose up --build frontend-admin
# → http://localhost:5174
```
