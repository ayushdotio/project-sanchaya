# 01 — Project Context & Architecture Rules (`.roo/rules/01-project-context.md`)

## 1. Project Identity
**Sanchaya (सञ्चय)** is an evidence-backed software project knowledge handover platform built by **Team Epsilum** (NMIET, Pune). When a contributor leaves a team, Sanchaya reconstructs the project's state from authorized sources (GitHub commits/PRs/issues, PDF/DOCX/TXT meeting notes, and CSV task trackers) and generates a human-reviewed, role-scoped handover and continuation plan.

## 2. The Core Architectural Directive
**Deterministic Verification Over Blind AI Trust:**
LLMs are used strictly for candidate claim extraction and phrasing gap questions. AI models must **never** be trusted to verify source citations, calculate evidence freshness, redact secrets, compute bus-factor risk, evaluate handover readiness, or enforce access control. All validation, security filtering, and state transitions are enforced by deterministic backend code.

## 3. Polyglot Monorepo Service Map & Ownership

Always check the active file path before writing code and strictly respect each service's stack and responsibility:

| Service Path | Tech Stack | Port | Domain Branch & Owner | Primary Responsibility |
| :--- | :--- | :--- | :--- | :--- |
| `services/frontend/` | React 18, Vite, Tailwind CSS | `3000` | `frontend` (Lokesh) | Role-aware UI across the 5 handover stages |
| `services/backend/` | Node.js 20, TypeScript, Express, Mongoose, Zod | `5000` | `backend` (Ayush) | API Gateway, Stateless JWT RBAC, Stage 1 Ingestion, Pre-AI Secret/PII Scanner |
| `services/ai-engine/` | Python 3.11, FastAPI, Pydantic, LLM API | `8001` | `ai-engine` (Varad / Firoz) | Candidate JSON extraction, 4-state Evidence Validator, Freshness Monitor, Gap Loop |
| `services/analytics-service/` | Python 3.11, FastAPI, ReportLab | `8002` | `analytics` (Prakhar) | Contribution Concentration Risk Map, 7-Point Readiness Checklist, PDF Export |
| `mongo` (Container) | MongoDB 7.0 | `27017` | Shared (`sanchaya-network`) | Unified persistence bridge (`users`, `projects`, `source_records`, `findings`, `gap_questions`) |

## 4. The 5-Stage Product Workflow & Domain Invariants

1. **Stage 1 — Connect (`services/backend`):**
   * Ingests GitHub activity, PDF/DOCX/TXT notes, and CSV tasks.
   * Assigns deterministic canonical IDs: `SRC-GH-xxx` (GitHub), `SRC-DOC-xxx` (Documents), and `SRC-TSK-xxx` (Tasks).
   * Captures three mandatory UTC ISO-8601 timestamps on every source record: `created_at`, `updated_at`, and `imported_at`.
   * Executes synchronous regex redaction (`secretScanner.ts`) replacing secrets with `[REDACTED_SECRET]` and PII with `[REDACTED_PII]` **before** MongoDB persistence.
2. **Stage 2 — Reconstruct (`services/ai-engine` & `services/analytics-service`):**
   * Extracts candidate decisions, task ownership, blockers, and dependencies as strict schema-validated JSON.
   * Computes a rule-based Contribution Concentration Risk Map from Git commit history and task distribution.
3. **Stage 3 — Verify (`services/ai-engine`):**
   * Deterministically cross-checks every cited `source_id` and `verbatim_excerpt` against MongoDB `source_records`.
   * Assigns one of 4 exact states: `Supported`, `Needs review`, `Conflicting`, or `Unknown`.
   * Flags findings with `Re-check Recommended` when newer code commits postdate the cited documentation's `updated_at` timestamp.
4. **Stage 4 — Review (`services/backend` & `services/analytics-service`):**
   * Routes `Unknown` and `Conflicting` findings to the Gap-to-Question Loop for the Outgoing Member. Responses are permanently badged as `Self-reported` (`evidence_origin: "self_reported"`).
   * Evaluates the 7-point Handover Readiness Checklist (`Needs Attention`, `Ready for Review`, `Approved for Sharing`).
5. **Stage 5 — Handover (`services/backend` & `services/analytics-service`):**
   * Enforces role and readiness gates (`readinessStatus === "Approved for Sharing"`) before allowing the Incoming Member to view the handover or download the ReportLab PDF.