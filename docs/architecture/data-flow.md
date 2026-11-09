# End-to-End Data Flow

## 1. Pipeline Overview

```text
[Authorized Sources: GitHub API | Meeting Notes (PDF/DOCX/TXT) | Task Tracker (CSV)]
                                       │
                                       ▼
        ┌──────────────────────────────────────────────────────────────┐
        │ 1. Ingestion & Normalization (services/backend)              │
        │    - Assigns deterministic ID (SRC-GH-*, SRC-DOC-*, SRC-TSK-*)│
        │    - Extracts ISO-8601 created_at, updated_at, imported_at   │
        └──────────────────────────────┬───────────────────────────────┘
                                       │
                                       ▼
        ┌──────────────────────────────────────────────────────────────┐
        │ 2. Pre-AI Secret & PII Scanner (services/backend)            │
        │    - Masks tokens, keys, passwords -> [REDACTED_SECRET]      │
        │    - Masks personal emails/phones  -> [REDACTED_PII]         │
        └──────────────────────────────┬───────────────────────────────┘
                                       │
                                       ▼
        ┌──────────────────────────────────────────────────────────────┐
        │ 3. Canonical Persistence (MongoDB: source_records)           │
        └──────────────┬───────────────────────────────┬───────────────┘
                       │                               │
                       ▼                               ▼
┌─────────────────────────────────────────┐ ┌─────────────────────────────────────────┐
│ 4A. AI Reconstruction & Verification    │ │ 4B. Risk & Readiness Analytics          │
│     (services/ai-engine)                │ │     (services/analytics-service)        │
│ - LLM extracts candidate findings JSON  │ │ - Computes Git commit & task silos      │
│ - Deterministic substring check vs DB   │ │ - Generates Contribution Risk Map       │
│ - Assigns: Supported / Needs review /   │ │ - Evaluates 7-point Readiness Checklist │
│   Conflicting / Unknown                 │ │   (Needs Attention / Ready / Approved)  │
│ - Generates Gap Questions for Unknowns  │ └────────────────────┬────────────────────┘
└──────────────────────┬──────────────────┘                      │
                       │                                         │
                       └───────────────────┬─────────────────────┘
                                           ▼
        ┌──────────────────────────────────────────────────────────────┐
        │ 5. Human-in-the-Loop Review & Gap Loop (services/frontend)   │
        │    - Outgoing Member submits answers -> Marked Self-reported │
        │    - Team Leader edits/approves findings & signs off         │
        └──────────────────────────────┬───────────────────────────────┘
                                       │
                                       ▼
        ┌──────────────────────────────────────────────────────────────┐
        │ 6. Role-Gated Handover & PDF Export                          │
        │    - Backend verifies role == incoming & state == Approved   │
        │    - Analytics service renders citation-linked ReportLab PDF │
        └──────────────────────────────────────────────────────────────┘
```
