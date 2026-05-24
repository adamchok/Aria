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
- **Five-stage pipeline** — OpenAI Agents SDK orchestration: Ingestion → Bank Statement → Normalisation → Matching → Report
- **Multi-tenant platform** — JWT login, role-based UIs, bank account ledger, webhooks, and programmatic API keys
- **Production stack** — FastAPI · Celery · PostgreSQL · MinIO · React 18

## Quick start

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)

```bash
git clone https://github.com/adamchok/Aria.git
cd Aria
cp .env.example .env
# Set DEFAULT_ADMIN_PASSWORD in .env so the platform admin can sign in (see below)
docker compose up --build
```

| Service | URL |
| --- | --- |
| Ops UI (reconciliation) | http://localhost:5173 |
| Admin UI (platform) | http://localhost:5174 |
| Tenant mgmt UI | http://localhost:5175 |
| API (Swagger) | http://localhost:8000/docs |
| Health | http://localhost:8000/health |

**Mock LLM** mode runs without Anthropic API keys. All API and UI access still requires authentication — see [First login](#first-login) below.

## First login

1. Set `DEFAULT_ADMIN_PASSWORD` in `.env` (repo root) or `backend/.env` before starting the API.
2. Open the **Admin UI** at http://localhost:5174 and sign in with `DEFAULT_ADMIN_EMAIL` / your password.
3. Create a **tenant** and a **tenant user** from the admin console.
4. Sign in to **Ops** (:5173) or **Tenant mgmt** (:5175) with the tenant user credentials.

Programmatic integrations can use tenant **API keys** (created in the mgmt app at `/keys`) via the `X-API-Key` header instead of JWT.

For live Claude extraction, see [Configuration](docs/configuration.md).

## Documentation

**Live docs:** [adamchok.github.io/Aria](https://adamchok.github.io/Aria/) — professional documentation site with sidebar navigation, search, and ARIA financial UI styling.

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

**Enable GitHub Pages:** Repository Settings → Pages → Source: `/docs` on `master`.

## Architecture at a glance

```text
Ops / Admin / Mgmt UIs  →  FastAPI (JWT + API key)  →  Celery Worker  →  Agents SDK Pipeline
                                    │                              │
                               PostgreSQL                    Claude LLMs
                               Redis                         FX APIs
                               MinIO (S3)
```

Supported corridors: **USD/MYR · EUR/MYR · GBP/MYR · SGD/MYR**

## Repository structure

```text
Aria/
├── backend/                 Python FastAPI + OpenAI Agents SDK pipeline
├── frontend-tenant-ops/     Reconciliation ops app (port 5173)
├── frontend-admin/          Platform admin app (port 5174)
├── frontend-tenant-mgmt/    Tenant configuration app (port 5175)
├── docs/                    GitHub Pages documentation
├── docker-compose.yml
└── ARIA_Technical_Specification.md
```

## Development

```bash
# Backend tests (no Docker required)
cd backend && pip install -e ".[dev]" && pytest -q

# Frontend tests (per app)
cd frontend-tenant-ops && npm install && npm test
cd frontend-tenant-mgmt && npm install && npm test
cd frontend-admin && npm install && npm test
```

See [Development](docs/development.md) for hybrid local setup, migrations, and conventions.

## Competition context

ARIA addresses Challenge Track 3 — **The Global Treasury Agent** — automating cross-border payment reconciliation for SMEs who receive payment proofs as screenshots, PDFs, and Excel exports, and must reconcile them against local bank statements despite FX variance and SWIFT deductions.

## License

See repository license file. Developed for AI Marathon 2026.
