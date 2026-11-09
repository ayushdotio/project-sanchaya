# 04 — Testing & Evaluation Verification Rules (`.roo/rules/04-testing-rules.md`)

All code contributions and automated tests in Sanchaya must align with the platform's 5 measurable evaluation metrics and verification rules.

## 1. Deterministic Verification Rules (Stage 3 Gate)
Unit and integration tests for `services/ai-engine/services/evidence_validator.py` must verify that findings are deterministically classified into the 4 verification states:
1. **`Supported`:** Passes **only** when `finding.source_id` exists in MongoDB `source_records` AND `finding.verbatim_excerpt` is an exact, case-normalized substring of `source_record.redacted_content`. Any fabricated `source_id` or non-matching excerpt must automatically be downgraded to `Needs review` or `Unknown`.
2. **`Needs review`:** Triggered when a claim relies on a partial match, an informal single note, or a task record missing an owner or deadline.
3. **`Conflicting`:** Triggered when a newer `SRC-GH-*` commit/PR (`updated_at`) contradicts an earlier `SRC-DOC-*` note or `SRC-TSK-*` status. Both sources must be preserved side-by-side with timestamps.
4. **`Unknown`:** Triggered when no valid supporting excerpt exists in MongoDB; must automatically generate a targeted question in `gap_questions`.

## 2. Metric 5 Security & Access Control Benchmarks (`services/backend/`)
Every pull request from `backend` to `develop` must pass the **Metric 5 (Access Control & Readiness Reliability)** test suite:

### 2.1 100% Pre-AI Redaction Test (`secretScanner.test.ts`)
* Run synthetic payloads containing planted dummy secrets across all supported formats (`.pdf`, `.docx`, `.txt`, `.csv`, and mock GitHub commit payloads):
  * Dummy GitHub PAT (`ghp_1234567890abcdefghijklmnopqrstuvwxyz`)
  * Dummy OpenAI/Stripe key (`sk-proj-1234567890abcdef`)
  * Dummy `.env` assignment (`JWT_SECRET=my_leaked_secret_value`)
  * Dummy personal email (`developer.private@gmail.com`)
* **Assertion:** `redacted_content` stored in MongoDB must contain zero occurrences of the raw strings, replacing them with `[REDACTED_SECRET]` and `[REDACTED_PII]`, and `metadata.redactionCount` must equal the exact number of planted items.

### 2.2 Role Isolation & Readiness Gate Tests (`rbac.test.ts`)
* **Test Case A (Incoming Source/Draft Block):** Issue a valid JWT with `role: "incoming"` and request `GET /api/projects/:id/sources`, `GET /api/projects/:id/findings`, and `GET /api/projects/:id/gap-questions`.
  * **Assertion:** All requests must deterministically return `403 Forbidden`.
* **Test Case B (Unapproved Handover Block):** With a project in `Needs Attention` or `Ready for Review` state, request `GET /api/projects/:id/handover` and `GET /api/projects/:id/handover/export-pdf` using an `incoming` JWT.
  * **Assertion:** Both endpoints must return `403 Forbidden`.
* **Test Case C (Outgoing Approval Block):** Using an `outgoing` JWT, attempt `POST /api/projects/:id/findings/:fid/approve` and `POST /api/projects/:id/readiness/sign-off`.
  * **Assertion:** Both endpoints must return `403 Forbidden`.
* **Test Case D (Approved Handover Release):** After a `leader` JWT signs off on all 7 readiness checklist items (`readinessStatus === "Approved for Sharing"`), repeat the `incoming` JWT request to `GET /api/projects/:id/handover` and `GET /api/projects/:id/handover/export-pdf`.
  * **Assertion:** Both endpoints must return `200 OK` with verified citations and `Self-reported` badges intact.

## 3. Pre-PR Health & Integration Verification
Before opening a Pull Request from any domain branch (`frontend`, `backend`, `ai-engine`, `analytics`) into `develop`:
1. Ensure `npm run build` (`tsc`) passes in `services/backend` with zero TypeScript compiler errors.
2. Verify `docker compose up -d --build` starts cleanly and `GET http://localhost:5000/health` returns `200 OK`.
3. Never use real personal credentials or confidential third-party repositories in test fixtures; use only synthetic or permissioned evaluation data.