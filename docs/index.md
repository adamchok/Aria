---
title: Overview
layout: default
description: "ARIA — Autonomous Reconciliation Intelligence Agent"
permalink: /
nav_order: 1
---

<div class="aria-hero">
  <img
    src="{{ '/assets/images/aria-icon.png' | relative_url }}"
    alt=""
    class="aria-hero__logo"
    width="56"
    height="56"
  />
  <p class="aria-hero__eyebrow">AI Marathon 2026 · Challenge Track 3 — Global Treasury Agent</p>
  <h1 class="aria-hero__title">Autonomous Reconciliation Intelligence Agent</h1>
  <p class="aria-hero__lead">
    Upload payment proofs in any format, reconcile against bank statements with FX-aware AI reasoning,
    and export audit-ready Excel reports — in under 60 seconds per batch.
  </p>
  <div class="aria-hero__actions">
    <a class="aria-hero__btn aria-hero__btn--primary" href="{{ '/getting-started' | relative_url }}">Get started</a>
    <a class="aria-hero__btn aria-hero__btn--secondary" href="{{ '/architecture' | relative_url }}">Architecture</a>
    <a class="aria-hero__btn aria-hero__btn--secondary" href="https://github.com/adamchok/Aria">View on GitHub</a>
  </div>
</div>

## Pipeline at a glance

{% include aria-workflow-overview.html %}

ARIA automates the full cross-border reconciliation lifecycle for SMEs. Finance teams upload payment proofs (screenshots, PDFs, Excel) and a bank statement. An OpenAI Agents SDK pipeline with Anthropic Claude specialists extracts structured data, converts amounts to a base currency with live FX rates, matches transactions with explainable confidence scoring, and exports an audit-ready Excel report.

{: .note }
> **NovaPay** (`frontend-novapay`, port 5173) is a **reference external client** bundled with this repo — it simulates how an SME ERP or treasury system integrates with ARIA via the REST API. ARIA's own operator UIs are **Admin** (:5174) and **Tenant mgmt** (:5175). See [Solution]({{ '/solution' | relative_url }}) for the full application map.

## Key metrics

<div class="aria-stats">
  <div class="aria-stat">
    <p class="aria-stat__label">Batch latency</p>
    <p class="aria-stat__value">&lt; 60 s</p>
    <p class="aria-stat__hint">50-transaction target</p>
  </div>
  <div class="aria-stat">
    <p class="aria-stat__label">Auto-match threshold</p>
    <p class="aria-stat__value">≥ 75%</p>
    <p class="aria-stat__hint">High confidence</p>
  </div>
  <div class="aria-stat">
    <p class="aria-stat__label">Review queue</p>
    <p class="aria-stat__value">50–74%</p>
    <p class="aria-stat__hint"><span class="aria-badge aria-badge--uncertain">Uncertain</span></p>
  </div>
  <div class="aria-stat">
    <p class="aria-stat__label">Corridors</p>
    <p class="aria-stat__value">4</p>
    <p class="aria-stat__hint">USD · EUR · GBP · SGD → MYR</p>
  </div>
</div>

## Documentation

<div class="aria-grid">
  <a class="aria-card" href="{{ '/problem-statement' | relative_url }}">
    <p class="aria-card__title">Problem Statement</p>
    <p class="aria-card__desc">Why cross-border reconciliation remains unsolved for SMEs.</p>
    <span class="aria-card__arrow" aria-hidden="true">→</span>
  </a>
  <a class="aria-card" href="{{ '/solution' | relative_url }}">
    <p class="aria-card__title">Solution</p>
    <p class="aria-card__desc">Value proposition, workflow, and key differentiators.</p>
    <span class="aria-card__arrow" aria-hidden="true">→</span>
  </a>
  <a class="aria-card" href="{{ '/architecture' | relative_url }}">
    <p class="aria-card__title">Architecture</p>
    <p class="aria-card__desc">Four-agent pipeline, data flow, and technology stack.</p>
    <span class="aria-card__arrow" aria-hidden="true">→</span>
  </a>
  <a class="aria-card" href="{{ '/getting-started' | relative_url }}">
    <p class="aria-card__title">Getting Started</p>
    <p class="aria-card__desc">Docker, hybrid dev, and zero-infra setup — step by step.</p>
    <span class="aria-card__arrow" aria-hidden="true">→</span>
  </a>
  <a class="aria-card" href="{{ '/configuration' | relative_url }}">
    <p class="aria-card__title">Configuration</p>
    <p class="aria-card__desc">Environment variables, API keys, and tuning parameters.</p>
    <span class="aria-card__arrow" aria-hidden="true">→</span>
  </a>
  <a class="aria-card" href="{{ '/api-reference' | relative_url }}">
    <p class="aria-card__title">API Reference</p>
    <p class="aria-card__desc">REST endpoints, job lifecycle, and error codes.</p>
    <span class="aria-card__arrow" aria-hidden="true">→</span>
  </a>
</div>

## Quick start

The fastest path to a running stack — **mock LLM**, no Anthropic API keys required (authentication still required):

```bash
git clone https://github.com/adamchok/Aria.git
cd Aria
cp .env.example .env
# Set DEFAULT_ADMIN_PASSWORD=your-password in .env
docker compose up --build
```

| Service | URL | Notes |
| --- | --- | --- |
| NovaPay (reference client) | [localhost:5173](http://localhost:5173) | Demo UI login; API calls use `X-API-Key` via `VITE_API_KEY` |
| Admin UI | [localhost:5174](http://localhost:5174) | Platform admin — seed credentials |
| Tenant mgmt UI | [localhost:5175](http://localhost:5175) | Keys, webhooks, bank accounts |
| API (Swagger) | [localhost:8000/docs](http://localhost:8000/docs) | Interactive OpenAPI |
| Health | [localhost:8000/health](http://localhost:8000/health) | Liveness check |
| MinIO console | [localhost:9001](http://localhost:9001) | `ariaadmin` / `ariaadmin` |

{: .tip }
> **First login:** Set `DEFAULT_ADMIN_PASSWORD` in `.env`, open the Admin UI (:5174), create a tenant and tenant user. Sign in to **Tenant mgmt** (:5175) with the tenant user. For **NovaPay** (:5173), use demo credentials (`finance@novapay.demo` / `novapay2026`) and set `VITE_API_KEY` in `frontend-novapay/.env` (see [Getting Started]({{ '/getting-started' | relative_url }})).

{: .tip }
> **Progressive disclosure:** Mock mode explores the full pipeline at zero LLM cost. Switch to live Claude extraction when ready — see [Configuration]({{ '/configuration' | relative_url }}).

## Confidence routing

| Confidence | Status | Action |
| ---: | --- | --- |
| ≥ 0.75 | <span class="aria-badge aria-badge--matched">Matched</span> | Auto-match allowed |
| 0.50 – 0.74 | <span class="aria-badge aria-badge--uncertain">Uncertain</span> | Human review queue |
| &lt; 0.50 | <span class="aria-badge aria-badge--unmatched">Unmatched</span> | Exception report |
| Extraction &lt; 0.50 | <span class="aria-badge aria-badge--neutral">Escalated</span> | Route to review |

Low-confidence items are **never** auto-confirmed — a deliberate compliance control for finance teams.

## Repository layout

```text
Aria/
├── backend/                  FastAPI, Agents SDK pipeline, Celery worker
├── frontend-novapay/         NovaPay reference client — external SME API simulation (port 5173)
├── frontend-admin/           Platform admin app (port 5174)
├── frontend-tenant-mgmt/     Tenant configuration app (port 5175)
├── docs/                     This documentation site
└── docker-compose.yml
```
