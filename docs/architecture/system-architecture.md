# System Architecture — Sanchaya (सञ्चय)

## 1. Overview
Sanchaya is an evidence-backed project knowledge handover platform designed to prevent critical technical context from leaving when team members depart. It reconstructs a software project's state from authorized sources (GitHub activity, meeting notes, and task boards) and produces a verified, role-scoped handover report.

## 2. Core Architectural Principle
**Deterministic Verification Over Blind AI Trust:** LLMs are used strictly for candidate extraction and gap-question phrasing. Source normalization, secret/PII redaction, verbatim excerpt verification, evidence freshness calculation, contribution concentration metrics, readiness checklist evaluation, and role-based access control (RBAC) are enforced by deterministic backend code.

## 3. Polyglot Microservice Topology

Sanchaya operates as a containerized monorepo divided into four core services and a shared persistence layer:

| Service Directory | Technology Stack | Port | Owner | Core Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| `services/frontend` | React 18, Vite, Tailwind CSS | `3000` | Lokesh Pawar | Role-aware UI across the 5 handover stages |
| `services/backend` | Node.js 20, TypeScript, Express, Zod | `5000` | Ayush Nirmal | API Gateway, JWT RBAC, Stage 1 Ingestion, Secret/PII Scanner |
| `services/ai-engine` | Python 3.11, FastAPI, Pydantic, LLM API | `8001` | Varad Gaikwad / Firoz | Structured JSON extraction, 4-state Evidence Validator, Gap Detector |
| `services/analytics-service` | Python 3.11, FastAPI, ReportLab | `8002` | Prakhar Raj | Contribution Concentration Risk Map, 7-Point Readiness Engine, PDF Export |
| `mongo` (Container) | MongoDB 7.0 | `27017` | Shared | Unified canonical store for redacted sources, findings, and audit logs |

## 4. The Five-Stage Product Architecture

1. **Stage 1 — Connect (`services/backend`):** Ingests GitHub commits/PRs/issues, PDF/DOCX/TXT meeting notes, and CSV task trackers. Normalizes inputs with deterministic IDs (`SRC-GH-*`, `SRC-DOC-*`, `SRC-TSK-*`) and ISO-8601 timestamps (`created_at`, `updated_at`, `imported_at`). Runs deterministic regex scanning to mask secrets and PII before database storage.
2. **Stage 2 — Reconstruct (`services/ai-engine` & `services/analytics-service`):** Extracts chronological architectural decisions, task ownership, blockers, and dependencies using strict JSON schemas. Concurrently runs rule-based Git commit and task concentration analysis to produce a Contribution Concentration Risk Map.
3. **Stage 3 — Verify (`services/ai-engine`):** Cross-checks every AI-extracted claim against MongoDB source records to assign one of four deterministic states: `Supported`, `Needs review`, `Conflicting`, or `Unknown`. Computes evidence freshness badges (`Re-check Recommended` when code activity postdates documentation).
4. **Stage 4 — Review (`services/backend` & `services/analytics-service`):** Routes `Unknown` and `Conflicting` items into the Gap-to-Question Loop for the outgoing member (tagged as `Self-reported`). Evaluates the 7-point Handover Readiness Checklist (`Needs Attention`, `Ready for Review`, `Approved for Sharing`).
5. **Stage 5 — Handover (`services/backend` & `services/analytics-service`):** Enforces RBAC and readiness gates before releasing the approved continuation plan and citation-linked ReportLab PDF export to the incoming member.