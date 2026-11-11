# 03 — Security & Access Control Rules (`.roo/rules/03-security-rules.md`)

All generated and modified code must strictly enforce Sanchaya's security invariants. Never bypass or weaken these gates.

## 1. Pre-AI Deterministic Secret & PII Redaction (`secretScanner.ts`)
* **Hard Invariant:** Raw text from GitHub commits/PRs/issues, uploaded PDF/DOCX/TXT meeting notes, or CSV task sheets must **never** be saved to MongoDB or sent to an external LLM before passing through `services/backend/src/services/secretScanner.ts`.
* **Required Redaction Replacements:**
  * Cloud & API Keys (`AKIA...`, `sk-...`, `sk_live_...`, bearer secrets) -> `[REDACTED_SECRET]`
  * GitHub Tokens (`ghp_...`, `github_pat_...`, `gho_...`, `ghs_...`) -> `[REDACTED_SECRET]`
  * Config & `.env` Secrets (`JWT_SECRET=...`, `PASSWORD=...`, `MONGO_URI=...`, `PRIVATE_KEY=...`) -> `[REDACTED_SECRET]`
  * Private Key Blocks (`-----BEGIN ... PRIVATE KEY-----`) -> `[REDACTED_SECRET]`
  * Personal Data (Emails, phone numbers, IPv4 addresses) -> `[REDACTED_PII]`
* Persist `metadata.redactionCount` on each `SourceRecord` and never log raw unredacted secrets to `stdout`.

## 2. Stateless JWT & 3-Tier RBAC Enforcement (`authMiddleware.ts`)
Every protected route must enforce `authenticateToken` and `requireRoles([...])`:

| User Role Claim | Allowed Operations | Strictly Forbidden Operations (`403 Forbidden`) |
| :--- | :--- | :--- |
| `leader` | Create workspaces, assign roles, upload sources, trigger `/reconstruct`, edit/approve/reject findings, sign off `/readiness/sign-off`, view/export handover | Submitting outgoing member self-reported gap answers |
| `outgoing` | Upload PDF/DOCX/TXT/CSV sources, connect/sync GitHub, view sources/findings/gaps, submit answers to `/gap-questions/:qid/answer` | Creating workspaces, approving/rejecting findings, signing off on readiness |
| `incoming` | View approved `/handover`, download `/handover/export-pdf`, and `POST /handover/acknowledge` **ONLY WHEN** `readinessStatus === "Approved for Sharing"` | Accessing `/sources`, `/findings`, `/gaps`, `/gap-questions`, or viewing/exporting handovers when `readinessStatus !== "Approved for Sharing"` |

## 3. Credential, Token & Password Hardening
* **Password Hashing:** Hash passwords with `bcrypt` using `BCRYPT_SALT_ROUNDS = 12`. Set `select: false` on `passwordHash` in the Mongoose `User` model.
* **Password Reset Security:**
  * Generate reset tokens via `crypto.randomBytes(32).toString('hex')`.
  * Store only the `SHA-256` hash (`crypto.createHash('sha256')`) in `resetPasswordToken` (`select: false`) with a 15-minute expiry (`resetPasswordExpires`).
  * Return an identical `200 OK` response on `POST /api/auth/forgot-password` regardless of whether the email exists to prevent account enumeration.
* **No Hardcoded Secrets:** Load `JWT_SECRET`, `MONGO_URI`, and API tokens exclusively from environment variables validated at startup. Never commit `.env` files.

## 4. Upload & External Connector Safety
* **Multer Upload Guard (`uploadMiddleware.ts`):**
  * Whitelist only `.pdf`, `.docx`, `.txt`, and `.csv` extensions and their corresponding MIME types.
  * Enforce a strict `10 MB` file size cap per upload.
  * Sanitize filenames to block path traversal (`../`).
* **Read-Only GitHub Access (`githubService.ts`):**
  * Use strictly read-only GitHub REST API calls (`GET` commits, pull requests, issues). Never write, mutate, or push to user repositories.