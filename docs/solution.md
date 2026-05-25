---
title: Solution
layout: default
description: "ARIA's value proposition and key differentiators"
---

# Solution

{: .no_toc }

## Table of contents
{: .no_toc .text-delta }
1. TOC
{:toc}

---

## ARIA in one sentence

**ARIA** (Autonomous Reconciliation Intelligence Agent) is an AI-first reconciliation **platform**: external SME systems push transactions continuously through an authenticated API; the OpenAI Agents SDK pipeline reconciles them autonomously; results stream back in real time via SSE and webhooks. Three role-scoped web apps provide ops, platform admin, and tenant configuration UIs.

## Core value proposition

> ARIA converts a 2–4 hour manual reconciliation cycle into a **sub-60-second autonomous workflow**, with full auditability and human escalation for edge cases.

## End-to-end workflow

```mermaid
flowchart LR
  U[Upload proofs + bank stmt] --> E[Extract]
  E --> N[Normalise FX]
  N --> M[Match + score]
  M --> R[Report + Excel]
  M --> H{Confidence 0.5–0.75?}
  H -->|Yes| Q[Human review queue]
  H -->|No| R
  Q --> R
```

<div class="aria-pipeline">
  <span class="aria-pipeline__step">Upload</span>
  <span class="aria-pipeline__step">Extract</span>
  <span class="aria-pipeline__step">Normalise</span>
  <span class="aria-pipeline__step">Match</span>
  <span class="aria-pipeline__step">Report</span>
  <span class="aria-pipeline__step aria-pipeline__step--active">Review</span>
</div>

### Three web applications

| App | Port | Audience | Login |
| --- | --- | --- | --- |
| **Ops** (`frontend-tenant-ops`) | 5173 | Finance officers — reconciliation | Tenant user JWT |
| **Admin** (`frontend-admin`) | 5174 | Platform operators | Admin JWT (seeded via `DEFAULT_ADMIN_PASSWORD`) |
| **Tenant mgmt** (`frontend-tenant-mgmt`) | 5175 | Tenant administrators | Tenant user JWT |

#### Ops app — reconciliation (`:5173`)

| Route | Screen | Purpose |
| --- | --- | --- |
| `/login` | Sign in | Email + password |
| `/dashboard` | Pipeline dashboard | Job throughput, match-rate summary, recent jobs |
| `/jobs` | Job monitor | Paginated, filterable job list |
| `/jobs/{id}` | Job progress | Four-agent stepper driven by SSE (polling fallback) |
| `/jobs/{id}/results` | Results | Summary cards, reconciliation grid, export |
| `/jobs/{id}/review` | Review queue | Confirm / reject uncertain items |
| `/upload` | Upload | Manual file submission |
| `/ingest` | Simulate ingest | Upload bank statement + push proofs via ingest API |
| `/queue` | Transaction queue | Buffer status by corridor, manual flush → jobs |

#### Admin app — platform (`:5174`)

| Route | Screen | Purpose |
| --- | --- | --- |
| `/login` | Sign in | Platform admin credentials |
| `/tenants` | Tenants | Create and list tenants |
| `/tenants/{id}` | Tenant detail | Tenant overview, API keys (admin path) |
| `/users` | Users | Create platform and tenant users |
| `/analytics` | Analytics | Cross-tenant reconciliation statistics |
| `/queue` | Ingest queue | All tenants' buffer status, flush per tenant |

#### Tenant mgmt app — configuration (`:5175`)

| Route | Screen | Purpose |
| --- | --- | --- |
| `/login` | Sign in | Tenant user credentials |
| `/dashboard` | Overview | Tenant summary and quick links |
| `/keys` | API keys | Generate and revoke tenant API keys |
| `/webhooks` | Webhooks | Register endpoints, test delivery, delivery history |
| `/bank-accounts` | Bank accounts | Register accounts, upload statements, ledger view |
| `/bank-accounts/{id}` | Account detail | Statements and uncleared entries for one account |
| `/analytics` | Analytics | Tenant-scoped match rate and corridor breakdown |
| `/queue` | Transaction queue | Buffer status by corridor, manual flush |
| `/users` | Users | Invite tenant users (tenant-scoped) |

### What the finance officer does (manual upload flow)

| Step | Screen | Action |
| --- | --- | --- |
| 1 | `/upload` | Drag payment proofs; attach bank data (upload file **or** select bank account — all pending ledger entries are included automatically); select base currency (MYR) |
| 2 | `/jobs/{id}` | Watch four-agent stepper; SSE delivers live progress |
| 3 | `/jobs/{id}/results` | Summary cards, filterable grid, variance explanations |
| 4 | `/jobs/{id}/review` | Confirm or reject uncertain items (side-by-side proof vs bank line) |
| 5 | Export | Download Excel — Summary, Matched, Exceptions, Audit Log |

### What an external SME system does (API integration flow)

Demo this flow from **Tenant Ops** (`:5173`) — the Ops app simulates the external ERP pushing data into ARIA:

1. **Authenticate** — sign in to Ops, or obtain a tenant API key from Tenant mgmt → Keys (`/keys`)
2. **Ingest** — Ops → **Simulate ingest** (`/ingest`) calls `POST /api/v1/ingest/transactions` with base64-encoded proofs and corridor metadata; or call the API directly with the key
3. **Batch** — buffered items auto-batch via Celery Beat, or flush manually from Ops → **Queue** (`/queue`)
4. **Receive** — register a webhook in Tenant mgmt (`POST /api/v1/webhooks`); receive `job.completed` with HMAC-signed payload when reconciliation finishes
5. **Retrieve** — monitor jobs in Ops (`/jobs`), call `GET /api/v1/jobs/{id}/results`, or follow the SSE stream

## Key differentiators

<div class="aria-grid">
  <div class="aria-card" style="pointer-events: none;">
    <p class="aria-card__title">AI-first engine</p>
    <p class="aria-card__desc">The LLM reasoning chain is the reconciliation engine — rules are safety nets only.</p>
  </div>
  <div class="aria-card" style="pointer-events: none;">
    <p class="aria-card__title">Platform, not a tool</p>
    <p class="aria-card__desc">Multi-tenant API with key auth, continuous ingestion, webhooks, and SSE. Any SME system can integrate without the reference UI.</p>
  </div>
  <div class="aria-card" style="pointer-events: none;">
    <p class="aria-card__title">Vision-first ingestion</p>
    <p class="aria-card__desc">Multimodal extraction for images (PNG/JPG). PDF payment proofs and bank statements use structured parsers with LLM fallback.</p>
  </div>
  <div class="aria-card" style="pointer-events: none;">
    <p class="aria-card__title">FX-aware matching</p>
    <p class="aria-card__desc">Per-transaction tolerance windows using invoice and settlement rates plus SWIFT estimates.</p>
  </div>
  <div class="aria-card" style="pointer-events: none;">
    <p class="aria-card__title">Audit-ready output</p>
    <p class="aria-card__desc">Every decision includes variance explanation and full reasoning chain in the audit log.</p>
  </div>
  <div class="aria-card" style="pointer-events: none;">
    <p class="aria-card__title">Real-time visibility</p>
    <p class="aria-card__desc">SSE stream delivers pipeline progress per agent boundary. Webhooks push terminal events to external systems with HMAC-signed payloads.</p>
  </div>
</div>

## Confidence routing

| Confidence | Status | Action |
| ---: | --- | --- |
| ≥ 0.75 | <span class="aria-badge aria-badge--matched">Matched</span> | Auto-match allowed |
| 0.50 – 0.74 | <span class="aria-badge aria-badge--uncertain">Uncertain</span> | Human review queue; never auto-confirmed |
| &lt; 0.50 | <span class="aria-badge aria-badge--unmatched">Unmatched</span> | Exception report |
| Extraction &lt; 0.50 | <span class="aria-badge aria-badge--neutral">Escalated</span> | Route to review |

{: .tip }
> ARIA matched because the settlement amount falls within the FX tolerance window for USD/MYR on the value date — not because amounts were identical. See [Architecture]({{ '/architecture' | relative_url }}) for tolerance calculation.

## Supported scope (MVP)

| Dimension | Coverage |
| --- | --- |
| **Input formats** | JPEG, PNG, WEBP, PDF, XLSX, CSV |
| **Corridors** | USD/MYR, EUR/MYR, GBP/MYR, SGD/MYR |
| **Batch size** | Up to 200 transactions |
| **Base currency** | MYR (configurable) |
| **Export** | Excel (.xlsx) with four sheets |

## Success metrics

| Metric | Target |
| --- | --- |
| Extraction accuracy | &gt; 95% field-level on test corpus |
| Match precision (conf ≥ 0.75) | &gt; 90% |
| Pipeline latency (50 tx) | &lt; 60 s |
| Escalation rate | 5–20% to human review |

See [Architecture]({{ '/architecture' | relative_url }}) for technical design and [Getting Started]({{ '/getting-started' | relative_url }}) to run it locally.
