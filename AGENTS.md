# AGENTS.md — AI Coding Agent Directives for Sanchaya (सञ्चय)

## 1. Project Identity & Core Philosophy
**Sanchaya (सञ्चय)** is an evidence-backed software project knowledge handover platform built by Team Epsilum (NMIET, Pune). It reconstructs project state from authorized sources (GitHub commits/PRs/issues, PDF/DOCX/TXT meeting notes, and CSV task trackers) across a 5-stage workflow: **Connect -> Reconstruct -> Verify -> Review -> Handover**.

### The Golden Architectural Rule
**Deterministic Verification Over Blind AI Trust:**
LLMs are used strictly for candidate claim extraction and phrasing targeted gap questions. AI models are **never** trusted to verify evidence, redact secrets, calculate bus-factor risk, evaluate handover readiness, or enforce access control. All validation, timestamp freshness tracking, secret masking, and role gating must be implemented in deterministic backend code.

---

## 2. Monorepo Service Boundaries & Ownership

Before generating or modifying code, verify which service directory you are operating in and strictly respect its technology stack and boundaries:

| Directory | Stack | Port | Owner & Branch | Primary Scope |
| :--- | :--- | :--- | :--- | :--- |
| `services/frontend/` | React 18, Vite, Tailwind CSS | `3000` | Lokesh (`frontend`) | Role-aware UI screens across the 5 stages |
| `services/backend/` | Node.js 20, TypeScript, Express, Mongoose, Zod | `5000` | Ayush (`backend`) | API Gateway, Stateless JWT RBAC, Stage 1 Ingestion, Pre-AI Secret/PII Scanner |
| `services/ai-engine/` | Python 3.11, FastAPI, Pydantic, LLM API | `8001` | Varad / Firoz (`ai-engine`) | Structured JSON extraction, 4-state Evidence Validator, Freshness Monitor, Gap Loop |
| `services/analytics-service/` | Python 3.11, FastAPI, ReportLab | `8002` | Prakhar (`analytics`) | Contribution Concentration Risk Map, 7-Point Readiness Checklist, PDF Export |
| `mongo` (Container) | MongoDB 7.0 | `27017` | Shared | Unified canonical persistence bridge |

* **Cross-Service Rule:** Do not mix Python files into `services/backend/` or TypeScript files into `services/ai-engine/` or `services/analytics-service/`. Inter-service calls from the Node.js gateway to Python microservices must go through `services/backend/src/services/pythonBridge.ts` using internal Docker DNS (`http://ai-engine:8001` and `http://analytics-service:8002`).

---

## 3. Data & Domain Invariants (Must Never Be Violated)

1. **Canonical Source IDs:** Every ingested item in `source_records` must receive a deterministic prefix based on origin:
   * `SRC-GH-xxx` for GitHub commits, pull requests, and issues.
   * `SRC-DOC-xxx` for PDF, DOCX, and TXT meeting notes.
   * `SRC-TSK-xxx` for CSV task tracker rows.
2. **Mandatory ISO-8601 Timestamps:** Every `SourceRecord` must capture and persist `created_at` (original creation), `updated_at` (last source modification), and `imported_at` (Sanchaya ingestion time).
3. **Pre-AI Secret & PII Redaction:** No raw text may be written to MongoDB or sent to `services/ai-engine` before passing through `secretScanner.ts`. Detected secrets and PII must be replaced with `[REDACTED_SECRET]` and `[REDACTED_PII]`.
4. **4-State Deterministic Verification:** Every extracted finding must be validated against MongoDB by `evidence_validator.py` and assigned one of four exact states:
   * `Supported` (`source_id` exists AND `verbatim_excerpt` is an exact substring of `redacted_content`)
   * `Needs review`
   * `Conflicting`
   * `Unknown` (automatically routed to the Gap-to-Question Loop)
5. **Self-Reported Evidence Badge:** Answers submitted by an Outgoing Member in the Gap-to-Question Loop must always carry `evidence_origin: "self_reported"` and display a `Self-reported` badge—never merged silently as system-verified evidence.

---

## 4. Coding & Configuration Standards

### TypeScript (`services/backend/`)
* **Compiler Settings:** Target `ES2022` with `"module": "nodenext"`, `"moduleResolution": "nodenext"`, `"strict": true`, and `"noUncheckedIndexedAccess": true`. Use `.js` extensions in relative local TypeScript imports (required by `nodenext`).
* **Runtime Validation:** Validate all `req.body`, `req.query`, `req.params`, and environment variables (`src/config/env.ts`) using **Zod** schemas (`safeParse`).
* **Response Envelope:** Always return `{ success: boolean, message?: string, data?: any, error?: string, errors?: Record<string, string[]> }`.

### Python (`services/ai-engine/` & `services/analytics-service/`)
* Enforce **Pydantic v2** models for all FastAPI request/response bodies and LLM structured outputs.
* Never use raw unvalidated `json.loads()` on LLM responses without schema validation and fallback error handling.

### Environment & Docker Hygiene
* Maintain a **single root `.env` file** (copied from `.env.example`). Never commit `.env` files or hardcode credentials in `docker-compose.yml`.
* Inside Docker containers, use `mongodb://mongo:27017/sanchaya` (or `host.docker.internal` if Mongo runs on the host OS)—never `localhost:27017`.

---

## 5. Git & Branching Workflow Directives

Sanchaya uses a strict 4-tier Git hierarchy:
`main` (Tier 1) <- `develop` (Tier 2) <- `frontend | backend | ai-engine | analytics` (Tier 3) <- `<domain>/<task-name>` (Tier 4).

* **Never** commit, push, or open a Pull Request directly to `main`.
* Always pull integration updates from `origin/develop` before starting a new feature sub-branch and before pushing your domain branch.
* Use Conventional Commits: `feat(backend): ...`, `fix(ai-engine): ...`, `security(backend): ...`, `docs(architecture): ...`.