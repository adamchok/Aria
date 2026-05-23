# ARIA

**Autonomous Reconciliation Intelligence Agent**

AI-native cross-border payment reconciliation for SMEs — built for **AI Marathon 2026**, Challenge Track 3: Global Treasury Agent.

Upload payment proofs in any format, match them against bank statements with FX-aware AI reasoning, and export audit-ready Excel reports in under 60 seconds.

---

## Features

- **Multimodal ingestion** — JPEG, PNG, WEBP, PDF, XLSX, CSV via Claude vision (no template OCR)
- **FX-aware matching** — Per-transaction tolerance windows using live and historical rates
- **Explainable decisions** — Natural-language variance explanations and full audit chains
- **Human-in-the-loop** — Review queue for uncertain matches (confidence 0.5–0.75)
- **Four-agent pipeline** — LangGraph orchestration: Ingestion → Normalisation → Matching → Report
- **Production stack** — FastAPI · Celery · PostgreSQL · MinIO · React 18

## Quick start

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```bash
git clone https://github.com/your-org/Aria.git
cd Aria
docker compose up --build
```

| Service | URL |
| --- | --- |
| Web UI | http://localhost:5173 |
| API (Swagger) | http://localhost:8000/docs |
| Health | http://localhost:8000/health |

No API keys required in default **mock LLM** mode. For live Claude extraction, see [Configuration](docs/configuration.md).

## Documentation

Full documentation is published from the [`docs/`](docs/) folder and renders as a multi-page GitHub Pages site (just-the-docs theme with sidebar navigation).

| Page | Description |
| --- | --- |
| [Overview](docs/index.md) | Project introduction and quick links |
| [Problem Statement](docs/problem-statement.md) | The cross-border reconciliation gap |
| [Solution](docs/solution.md) | Value proposition and differentiators |
| [Architecture](docs/architecture.md) | System design, agents, and tech stack |
| [Getting Started](docs/getting-started.md) | Step-by-step setup and local run |
| [Configuration](docs/configuration.md) | Environment variables and API keys |
| [API Reference](docs/api-reference.md) | REST endpoints and job lifecycle |
| [Development](docs/development.md) | Testing and contribution guide |

**Enable GitHub Pages:** Repository Settings → Pages → Source: `/docs` on `main`.

## Architecture at a glance

```text
React UI  →  FastAPI  →  Celery Worker  →  LangGraph Pipeline
                              │                    │
                         PostgreSQL          Claude LLMs
                         Redis               FX APIs
                         MinIO (S3)
```

Supported corridors: **USD/MYR · EUR/MYR · GBP/MYR · SGD/MYR**

## Repository structure

```text
Aria/
├── backend/          Python FastAPI + LangGraph agents
├── frontend/         React 18 + TypeScript SPA
├── docs/             GitHub Pages documentation
├── docker-compose.yml
└── ARIA_Technical_Specification.md
```

## Development

```bash
# Backend tests (no Docker required)
cd backend && pip install -e ".[dev]" && pytest -q

# Frontend tests
cd frontend && npm install && npm test
```

See [Development](docs/development.md) for hybrid local setup, migrations, and conventions.

## Competition context

ARIA addresses Challenge Track 3 — **The Global Treasury Agent** — automating cross-border payment reconciliation for SMEs who receive payment proofs as screenshots, PDFs, and Excel exports, and must reconcile them against local bank statements despite FX variance and SWIFT deductions.

## License

See repository license file. Developed for AI Marathon 2026.
