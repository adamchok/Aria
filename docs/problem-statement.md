---
title: Problem Statement
layout: default
nav_order: 2
description: "The cross-border reconciliation gap for SMEs"
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

## Three compounding factors

### 1. FX rate timing

The exchange rate at invoice date rarely equals the rate at settlement. Over a typical 2–5 business day settlement window, variance of **0.2–1.5%** is normal. Matching on exact amounts fails systematically.

### 2. Intermediary deductions

SWIFT correspondent banks deduct **USD 10–35 per transaction**. The amount that lands in the beneficiary account is lower than the sender's stated amount — and lower than a naive FX conversion would predict.

### 3. Format fragmentation

Payment proofs arrive as:

- WhatsApp payment screenshots
- Scanned bank slips and emailed PDFs
- SWIFT MT103 print-outs
- Manually keyed Excel exports

None of these are in a standard machine-readable format. Template-based OCR breaks when layouts change.

## Market scale

| Metric | Estimate |
| --- | --- |
| Cross-border B2B transactions (2025 forecast) | ~16.3 billion |
| SME share of volume | ~40% |
| SMEs citing reconciliation automation as top pain | 29% |
| Annual cost of cross-border payment friction | &gt; USD 120 billion |

For SMEs with margins of 5–15%, a single unreconciled payment is not a rounding error — it is a **compliance flag**, a **supplier dispute risk**, and a **cash flow signal**.

## Why existing solutions fall short

| Category | Limitation |
| --- | --- |
| **ERP modules** (SAP, Oracle) | Enterprise pricing; structured EDI input only |
| **Traditional OCR** | Template-dependent; breaks on format variation |
| **Manual spreadsheets** | Scales with headcount; 3–5% human error rate on FX transactions |
| **Rule-based fintech** (e.g. Xero) | Fixed tolerance rules; no per-transaction FX reasoning |
| **Banking portals** | Single-bank; no cross-source aggregation |

## What a solution must handle

A credible reconciliation system for cross-border SMEs must:

1. **Ingest any document format** without brittle templates
2. **Reason about FX variance** per transaction, not apply a fixed epsilon
3. **Explain every match decision** for audit and compliance
4. **Escalate uncertainty** to humans rather than auto-confirming edge cases
5. **Process batches quickly** — finance teams cannot wait minutes per transaction

These requirements map directly to ARIA's design. See [Solution]({% link solution.md %}) for how we address them.
