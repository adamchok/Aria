---
title: Problem Statement
layout: default
description: "The cross-border reconciliation gap for SMEs"
nav_order: 2
---

# Problem Statement

{: .no_toc }

## Table of contents
{: .no_toc .text-delta }
1. TOC
{:toc}

---

## The reconciliation gap

An SME invoices a US buyer for **USD 10.00**. The buyer pays via SWIFT. The local bank account receives **MYR 42.30**. The finance officer must answer:

- Was this the correct payment?
- Which invoice does it cover?
- Why is the amount different from the expected MYR 42.50?

This happens on **every international transaction** — and existing tools were not built for it.

<div class="aria-stats">
  <div class="aria-stat">
    <p class="aria-stat__label">Invoiced</p>
    <p class="aria-stat__value">USD 10.00</p>
    <p class="aria-stat__hint">Invoice date rate → MYR 42.50 expected</p>
  </div>
  <div class="aria-stat">
    <p class="aria-stat__label">Received</p>
    <p class="aria-stat__value">MYR 42.30</p>
    <p class="aria-stat__hint">Settlement date · SWIFT deductions</p>
  </div>
  <div class="aria-stat">
    <p class="aria-stat__label">Variance</p>
    <p class="aria-stat__value">MYR 0.20</p>
    <p class="aria-stat__hint"><span class="aria-badge aria-badge--uncertain">Needs explanation</span></p>
  </div>
</div>

## Three compounding factors

### 1. FX rate timing

The exchange rate at invoice date rarely equals the rate at settlement. Over a typical 2–5 business day settlement window, variance of **0.2–1.5%** is normal. Matching on exact amounts fails systematically.

### 2. Intermediary deductions

SWIFT correspondent banks deduct **USD 10–35 per transaction**. The amount that lands in the beneficiary account is lower than a naive FX conversion would predict.

### 3. Format fragmentation

Payment proofs arrive as WhatsApp screenshots, scanned slips, emailed PDFs, SWIFT print-outs, and Excel exports — none in a standard machine-readable format. Template-based OCR breaks when layouts change.

## Market scale

| Metric | Estimate |
| --- | --- |
| Cross-border B2B transactions (2025 forecast) | ~16.3 billion |
| SME share of volume | ~40% |
| SMEs citing reconciliation automation as top pain | 29% |
| Annual cost of cross-border payment friction | &gt; USD 120 billion |

For SMEs with margins of 5–15%, a single unreconciled payment is a **compliance flag**, a **supplier dispute risk**, and a **cash flow signal** — not a rounding error.

## Why existing solutions fall short

| Category | Limitation |
| --- | --- |
| **ERP modules** (SAP, Oracle) | Enterprise pricing; structured EDI input only |
| **Traditional OCR** | Template-dependent; breaks on format variation |
| **Manual spreadsheets** | Scales with headcount; 3–5% error rate on FX transactions |
| **Rule-based fintech** | Fixed tolerance rules; no per-transaction FX reasoning |
| **Banking portals** | Single-bank; no cross-source aggregation |

## What a solution must handle

1. **Ingest any document format** without brittle templates
2. **Reason about FX variance** per transaction, not a fixed epsilon
3. **Explain every match decision** for audit and compliance
4. **Escalate uncertainty** to humans rather than auto-confirming edge cases
5. **Process batches quickly** — finance teams cannot wait minutes per transaction

{: .important }
> These requirements map directly to ARIA's design. Continue to [Solution]({{ '/solution' | relative_url }}) for how we address them.
