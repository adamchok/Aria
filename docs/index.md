---
title: Overview
layout: default
description: "ARIA — Autonomous Reconciliation Intelligence Agent"
permalink: /
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

<div class="aria-pipeline">
  <span class="aria-pipeline__step">Upload</span>
  <span class="aria-pipeline__step aria-pipeline__step--active">Extract</span>
  <span class="aria-pipeline__step">Normalise</span>
  <span class="aria-pipeline__step">Match</span>
  <span class="aria-pipeline__step">Report</span>
  <span class="aria-pipeline__step">Human review</span>
</div>

ARIA automates the full cross-border reconciliation lifecycle for SMEs. Finance teams upload payment proofs (screenshots, PDFs, Excel) and a bank statement. A four-agent LangGraph pipeline extracts structured data, converts amounts to a base currency with live FX rates, matches transactions with explainable confidence scoring, and exports an audit-ready Excel report.

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

The fastest path to a running stack — **mock LLM**, no API keys required:

```bash
git clone https://github.com/adamchok/Aria.git
cd Aria
docker compose up --build
```

| Service | URL | Notes |
| --- | --- | --- |
| Web UI | [localhost:5173](http://localhost:5173) | Upload → progress → results → review |
| API (Swagger) | [localhost:8000/docs](http://localhost:8000/docs) | Interactive OpenAPI |
| Health | [localhost:8000/health](http://localhost:8000/health) | Liveness check |
| MinIO console | [localhost:9001](http://localhost:9001) | `ariaadmin` / `ariaadmin` |

{: .tip }
> **Progressive disclosure:** Start with mock mode to explore the full pipeline at zero API cost. Switch to live Claude extraction when you are ready — see [Configuration]({{ '/configuration' | relative_url }}).

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
├── backend/          FastAPI, LangGraph agents, Celery worker
├── frontend/         React 18 SPA (Vite, TanStack Query, AG Grid)
├── docs/             This documentation site
└── docker-compose.yml
```
