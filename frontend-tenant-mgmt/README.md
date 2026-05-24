# ARIA Tenant Management

Tenant configuration app — API keys, webhooks, bank accounts, analytics, ingest queue, and tenant users.

React 18 + TypeScript · Vite · Tailwind · TanStack Query · JWT auth (tenant user role).

**Port:** 5175

## Quick start

```bash
cd frontend-tenant-mgmt
npm install
cp .env.example .env
npm run dev          # → http://localhost:5175
```

Sign in with a **tenant user** account (created in Admin UI or invited here by a tenant admin).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server with `/api` proxy |
| `npm run build` | Type-check + production bundle |
| `npm run typecheck` | Strict TypeScript |
| `npm test` | Vitest unit tests |

## Routes

```
/login                      Sign in (tenant user JWT)
/dashboard                  Tenant overview
/keys                       Generate and revoke API keys
/webhooks                   Webhook registration and delivery history
/bank-accounts              Register bank accounts
/bank-accounts/:accountId   Statements and ledger for one account
/analytics                  Tenant-scoped reconciliation statistics
/queue                      Transaction buffer status + manual flush
/users                      Invite tenant users
```

## Architecture notes

- **Auth** — `TenantRoleRoute` requires `tenant_user` role with `tenant_id` in JWT
- **API client** — Tenant-scoped routes under `/api/v1/tenant/*`, `/api/v1/bank-accounts`, `/api/v1/webhooks`, etc.

## Docker Compose

```bash
docker compose up --build frontend-tenant-mgmt
# → http://localhost:5175
```
