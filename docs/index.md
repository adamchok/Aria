---
title: Overview
layout: default
nav_order: 1
description: "ARIA — Autonomous Reconciliation Intelligence Agent"
permalink: /
---

# ARIA

**Autonomous Reconciliation Intelligence Agent**

{: .fs-6 .fw-300 }

AI-native cross-border payment reconciliation for SMEs — built for **AI Marathon 2026**, Challenge Track 3: Global Treasury Agent.

---

## What is ARIA?

ARIA automates the full reconciliation lifecycle for cross-border SME payments:

**Upload → Extract → Normalise → Match → Report → Human Review (when needed)**

Finance teams upload payment proofs (screenshots, PDFs, Excel) and a bank statement. A four-agent LangGraph pipeline extracts structured data with multimodal LLMs, converts amounts to a base currency with live FX rates, matches transactions with explainable confidence scoring, and exports an audit-ready Excel report. Uncertain matches route to a human review queue in the web UI.

## At a glance

| Capability | Detail |
| --- | --- |
| **Input formats** | JPEG, PNG, WEBP, PDF, XLSX, CSV |
| **Currency corridors** | USD/MYR, EUR/MYR, GBP/MYR, SGD/MYR |
| **Batch size** | Up to 200 transactions |
| **Target latency** | &lt; 60 s for a 50-transaction batch |
| **Confidence routing** | Auto-match ≥ 0.75 · Review 0.5–0.75 · Escalate &lt; 0.5 |
| **Stack** | FastAPI · LangGraph · Celery · PostgreSQL · React |

## Documentation

| Page | Description |
| --- | --- |
| [Problem Statement]({% link problem-statement.md %}) | Why cross-border reconciliation is unsolved for SMEs |
| [Solution]({% link solution.md %}) | What ARIA does and how it differs |
| [Architecture]({% link architecture.md %}) | System design, agents, data flow, tech stack |
| [Getting Started]({% link getting-started.md %}) | Prerequisites, setup, and local run (step-by-step) |
| [Configuration]({% link configuration.md %}) | Environment variables and API keys |
| [API Reference]({% link api-reference.md %}) | REST endpoints and job lifecycle |
| [Development]({% link development.md %}) | Testing, project layout, contributing |

## Quick start

The fastest path to a running stack (Docker, mock LLM — no API keys required):

```bash
git clone https://github.com/your-org/Aria.git
cd Aria
docker compose up --build
```

| Service | URL |
| --- | --- |
| Web UI | [http://localhost:5173](http://localhost:5173) |
| API + Swagger | [http://localhost:8000/docs](http://localhost:8000/docs) |
| MinIO console | [http://localhost:9001](http://localhost:9001) (ariaadmin / ariaadmin) |

For live Claude extraction, FX API keys, and hybrid local development, see [Getting Started]({% link getting-started.md %}) and [Configuration]({% link configuration.md %}).

## Repository layout

```text
Aria/
├── backend/          FastAPI, LangGraph agents, Celery worker
├── frontend/         React 18 SPA (Vite, TanStack Query, AG Grid)
├── docs/             GitHub Pages documentation (this site)
├── docker-compose.yml
├── PROJECT_OVERVIEW.md
├── ARIA_Technical_Specification.md
└── CLAUDE.md         Contributor guide for AI assistants
```

## License & competition context

ARIA was developed for the **AI Marathon 2026** hackathon under Challenge Track 3 — The Global Treasury Agent. See [Problem Statement]({% link problem-statement.md %}) for market context and [Solution]({% link solution.md %}) for differentiators.
