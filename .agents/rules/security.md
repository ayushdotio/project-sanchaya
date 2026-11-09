# Security Rules & Enforcement Guardrails (`.agents/rules/security.md`)

All AI agents, code generators, and contributors operating within the Sanchaya repository must strictly enforce these security invariants. Any code change that weakens or bypasses these controls is invalid.

---

## Rule 1: Mandatory Pre-AI Secret & PII Redaction (Stage 1 Gate)
* **Invariant:** Raw ingested text from GitHub commits/PRs/issues, PDF/DOCX/TXT meeting notes, or CSV task sheets must **never** be persisted to MongoDB or transmitted to an LLM API before running through `services/backend/src/services/secretScanner.ts`.
* **Required Masking Patterns:**
  * API Keys & Cloud Tokens (`AKIA...`, `sk-...`, `sk_live_...`, high-entropy bearer strings) -> `[REDACTED_SECRET]`
  * GitHub Tokens (`ghp_...`, `github_pat_...`, `gho_...`, `ghs_...`) -> `[REDACTED_SECRET]`
  * Environment & Config Assignments (`JWT_SECRET=...`, `PASSWORD=...`, `MONGO_URI=...`, `PRIVATE_KEY=...`) -> `[REDACTED_SECRET]`
  * PEM / SSH Private Key Blocks (`-----BEGIN ... PRIVATE KEY-----`) -> `[REDACTED_SECRET]`
  * Personal Data (Email addresses, phone numbers, IPv4 addresses) -> `[REDACTED_PII]`
* **Audit Logging:** Every scan must record `redactionCount` in the source record's metadata without logging the raw secret string to `stdout` or log files.

---

## Rule 2: Stateless JWT & 3-Tier Role-Based Access Control (RBAC)
Every protected API route in `services/backend` must execute `authenticateToken` followed by `requireRoles([...])` from `src/middleware/authMiddleware.ts`.

### Strict Role Boundaries
1. **`leader` (Team Leader / Mentor):**
   * Sole role permitted to create workspaces, assign members, trigger AI reconstruction (`POST /reconstruct`), approve/reject findings, and sign off on the 7-point Handover Readiness Checklist (`POST /readiness/sign-off`).
2. **`outgoing` (Departing Member):**
   * Permitted to upload meeting notes/task CSVs, trigger read-only GitHub sync, and submit answers to targeted gap questions (`POST /gap-questions/:questionId/answer`).
   * Strictly blocked from approving findings or signing off on the readiness checklist (`403 Forbidden`).
3. **`incoming` (Onboarding Member):**
   * **Hard Isolation Rule:** Must receive `403 Forbidden` on any request to `/sources`, `/findings`, `/gaps`, or `/gap-questions`. Incoming members must never see raw/redacted source records or unapproved candidate findings.
   * **Handover Readiness Gate:** Access to `GET /api/projects/:projectId/handover` and `GET /api/projects/:projectId/handover/export-pdf` for an `incoming` user must be rejected with `403 Forbidden` unless `project.readinessStatus === "Approved for Sharing"` and all 7 checklist criteria are satisfied.

---

## Rule 3: Authentication & Credential Hardening
* **Password Storage:** Passwords must be hashed using `bcrypt` with a minimum of `12` salt rounds (`BCRYPT_SALT_ROUNDS = 12`). `passwordHash` must have `select: false` on the Mongoose `User` schema.
* **Password Reset Tokens:**
  * Generate reset tokens using `crypto.randomBytes(32).toString('hex')`.
  * Store only the `SHA-256` hash of the reset token in MongoDB (`resetPasswordToken`, `select: false`) with a strict 15-minute expiration (`resetPasswordExpires`).
  * `POST /api/auth/forgot-password` must return an identical `200 OK` message whether or not the email exists to prevent user enumeration.
* **JWT Security:** Sign tokens with `process.env.JWT_SECRET` (validated at startup via Zod in `src/config/env.ts`). Never hardcode production secrets in source files or `docker-compose.yml`.

---

## Rule 4: File Upload & External Connector Safety
* **Multipart Upload Constraints (`uploadMiddleware.ts`):**
  * Strictly whitelist extensions and MIME types: `.pdf` (`application/pdf`), `.docx` (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`), `.txt` (`text/plain`), and `.csv` (`text/csv`).
  * Enforce a strict maximum file size limit (`10 MB` per file) and reject unexpected multipart fields.
  * Sanitize original filenames before processing to prevent path traversal (`../`).
* **Read-Only GitHub Scope (`githubService.ts`):**
  * GitHub connectors must only execute read-only `GET` operations (commits, pull requests, issues). Never implement write-backs, repository mutations, or webhook deletions.

---

## Rule 5: Container & Network Isolation
* Do not expose internal microservice ports (`8001` for `ai-engine`, `8002` for `analytics-service`, or `27017` for `mongo`) to the public internet in production compose definitions.
* Run production Node.js and Python containers as non-root users (`USER node` / `USER appuser`).
* Always use Helmet (`app.use(helmet())`), explicit CORS whitelisting, and JSON body size limits (`express.json({ limit: '1mb' })`) on the Express gateway.

---

## Rule 6: Metric 5 Compliance Check (Pre-Merge Gate)
Before merging any `backend` sub-branch into `develop`, verify:
1. **100% Secret Redaction:** Running the ingestion pipeline against synthetic test fixtures containing planted GitHub PATs, `.env` keys, and emails produces zero unmasked matches in MongoDB.
2. **Zero Privilege Escalation:** Automated requests using an `incoming` JWT against `/sources`, `/findings`, and unapproved `/handover` endpoints deterministically return `403 Forbidden`.