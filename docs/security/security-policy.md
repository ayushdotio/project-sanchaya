# Security Policy & Access Control Architecture

## 1. Core Security Principles
1. **Zero Unredacted LLM Exposure:** Raw commits, meeting notes, and task descriptions must never be saved to MongoDB or transmitted to an external LLM API prior to deterministic secret and PII scrubbing.
2. **Strict Role Isolation (RBAC):** Incoming team members must never see raw ingested sources, unverified AI claims, or draft handovers that have not passed the 7-point Handover Readiness Checklist and received Team Leader sign-off.
3. **Read-Only External Connectors:** GitHub integrations strictly enforce read-only scopes (`repo:status`, `public_repo`, or fine-grained read-only contents/issues/PRs). Sanchaya never writes back to source repositories.

## 2. Pre-AI Deterministic Secret & PII Redaction (`secretScanner.ts`)
Before persistence or AI processing, `services/backend/src/services/secretScanner.ts` executes a deterministic regex pass masking the following patterns:

| Pattern Category | Detection Target | Replacement Token |
| :--- | :--- | :--- |
| Cloud & API Keys | AWS (`AKIA...`), OpenAI (`sk-...`), Stripe (`sk_live_...`), Generic high-entropy keys | `[REDACTED_SECRET]` |
| GitHub Tokens | Personal Access Tokens (`ghp_...`, `github_pat_...`), OAuth (`gho_...`) | `[REDACTED_SECRET]` |
| Auth & `.env` Secrets | `Bearer <token>`, `JWT_SECRET=...`, `PASSWORD=...`, `MONGO_URI=...` | `[REDACTED_SECRET]` |
| Private Keys | PEM/RSA/SSH private key blocks (`-----BEGIN ... PRIVATE KEY-----`) | `[REDACTED_SECRET]` |
| Personal Data (PII) | Email addresses, phone numbers, IPv4 addresses | `[REDACTED_PII]` |

## 3. Role-Based Access Control (RBAC) Matrix

| Capability / Resource | Team Leader (`leader`) | Outgoing Member (`outgoing`) | Incoming Member (`incoming`) |
| :--- | :---: | :---: | :---: |
| Create Workspace & Assign Roles | Allowed | Denied (`403`) | Denied (`403`) |
| Upload Notes/Tasks & Sync GitHub | Allowed | Allowed | Denied (`403`) |
| View Redacted Source Records (`SRC-*`) | Allowed | Allowed | Denied (`403`) |
| Trigger AI Reconstruction | Allowed | Denied (`403`) | Denied (`403`) |
| Answer Gap-to-Question Prompts | View Only | Allowed | Denied (`403`) |
| Approve/Reject Findings & Sign Off Checklist | Allowed | Denied (`403`) | Denied (`403`) |
| View Approved Handover & Export PDF | Allowed | Denied (`403`) | Allowed **ONLY IF** `readiness == Approved` |
| Acknowledge Handover Receipt | View Only | Denied (`403`) | Allowed |

## 4. Upload & Container Hardening
* **Multipart Upload Filters (`uploadMiddleware.ts`):** Strictly restricts uploads to `.pdf`, `.docx`, `.txt`, and `.csv` MIME types with a hard file-size cap (default `10 MB` per file) to prevent memory exhaustion.
* **Password & Token Security:** User passwords are hashed with `bcrypt` (`12` salt rounds). Password reset tokens are generated via `crypto.randomBytes(32)` and stored as `SHA-256` hashes with a strict 15-minute TTL.
* **Environment Isolation:** Secrets are loaded exclusively from the root `.env` (gitignored). No fallback production secrets are permitted in committed source code.

## 5. Measurable Security Verification (Evaluation Metric 5)
All changes to `services/backend` must pass the Metric 5 security suite:
1. **100% Redaction Guarantee:** Synthetic datasets containing planted GitHub PATs, `.env` assignments, and personal emails must yield `0` leaked credentials in MongoDB `source_records` and LLM prompt logs.
2. **Boundary Enforcement:** Automated integration tests using an `incoming` JWT against unapproved workspaces must return `403 Forbidden` across `/sources`, `/findings`, `/handover`, and `/handover/export-pdf`.
