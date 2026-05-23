---
title: Solution
layout: default
nav_order: 3
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

**ARIA** (Autonomous Reconciliation Intelligence Agent) is an AI-native, multi-agent system that ingests payment proofs in any format, normalises amounts across currencies, and matches them against bank statements — producing auditable, explainable reconciliation reports with human escalation for edge cases.

## Core value proposition

> ARIA converts a 2–4 hour manual reconciliation cycle into a **sub-60-second autonomous workflow**, with full auditability and human escalation for edge cases.

## End-to-end workflow

```text
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────┐    ┌────────┐
│   Upload    │ →  │  Extract     │ →  │  Normalise  │ →  │  Match  │ →  │ Report │
│ proofs +    │    │  (vision +   │    │  (FX +      │    │ (fuzzy  │    │ Excel  │
│ bank stmt   │    │   parsers)   │    │  tolerance) │    │ + LLM)  │    │ export │
└─────────────┘    └──────────────┘    └─────────────┘    └─────────┘    └────────┘
                                                                    ↓
                                                          ┌─────────────────┐
                                                          │ Human review    │
                                                          │ (0.5 ≤ conf     │
                                                          │  < 0.75)        │
                                                          └─────────────────┘
```

### What the user does

1. **Upload** — Drag payment proofs (multi-file) and one bank statement onto `/upload`
2. **Wait** — Watch the four-agent progress stepper on `/jobs/{id}` (~seconds per batch)
3. **Review results** — Summary cards, filterable AG Grid, variance explanations on `/jobs/{id}/results`
4. **Resolve uncertain items** — Side-by-side review with Confirm / Reject / Manual Match on `/jobs/{id}/review`
5. **Export** — Download Excel with Summary, Matched, Exceptions, and Audit Log sheets

## Key differentiators

### AI-first, not AI-bolted-on

The LLM reasoning chain **is** the reconciliation engine. Rule-based logic exists only as a safety net (date windows, amount tolerance filters). This lets ARIA handle ambiguity — FX timing, intermediary fees, format variation — without brittle rule sets.

### Zero-OCR multimodal pipeline

Claude's vision capabilities read payment proofs the way a human would — layout, context, handwriting — without template-based OCR. Structured PDFs and Excel fall back to `pdfplumber` / `openpyxl` parsers.

### FX-aware fuzzy matching

Standard tools match on exact amounts. ARIA understands that USD 10.00 may legitimately appear as MYR 42.30–42.80 depending on FX rate date, corridor, and SWIFT charges. The Matching Agent retrieves historical rates and reasons through a **per-transaction tolerance window**.

### Explainable, auditable decisions

Every match includes:

- A natural-language **variance explanation**
- A full **reasoning chain** stored in the audit log
- A composite **confidence score** (0.0–1.0)

Finance teams can answer *why* ARIA matched — or failed to match — any transaction.

### Human-in-the-loop by design

| Confidence | Status | Action |
| --- | --- | --- |
| ≥ 0.75 | `MATCHED` | Auto-match allowed |
| 0.50 – 0.74 | `UNCERTAIN` | Human review queue |
| &lt; 0.50 | `UNMATCHED` | Exception report |
| Extraction &lt; 0.50 | — | Route to review; never auto-confirm |

Low-confidence items are **never** auto-confirmed — a deliberate compliance control.

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

See [Architecture]({% link architecture.md %}) for technical design and [Getting Started]({% link getting-started.md %}) to run it locally.
