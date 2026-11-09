# API Conventions & Contract (`docs/api/api-conventions.md`)

## 1. Overview & Topology
Sanchaya's external API surface is served exclusively through the **Node.js + TypeScript (Express.js) API Gateway** (`services/backend`). The React frontend never communicates directly with the internal Python microservices (`ai-engine` or `analytics-service`) or MongoDB.

| Traffic Path | Base URL (Local / Docker) | Protocol & Format |
| :--- | :--- | :--- |
| **Frontend Client -> API Gateway** | `http://localhost:5000/api` | REST / JSON & `multipart/form-data` |
| **API Gateway -> AI Engine** | `http://ai-engine:8001/internal` | Internal Docker REST / JSON |
| **API Gateway -> Analytics Service** | `http://analytics-service:8002/internal` | Internal Docker REST / JSON & PDF Stream |

---

## 2. Standard Request & Response Conventions

### 2.1 Headers
* **Standard JSON Requests:** `Content-Type: application/json`
* **File Uploads (Notes & CSVs):** `Content-Type: multipart/form-data`
* **Authenticated Routes:** `Authorization: Bearer <jwt_token>`

### 2.2 Naming & Data Formats
* **URL Paths:** `kebab-case` for multi-word resource names (`/gap-questions`, `/risk-map`, `/export-pdf`).
* **Route Parameters:** `camelCase` (`:projectId`, `:sourceId`, `:findingId`, `:questionId`).
* **JSON Payload Keys:**
  * API Gateway & Frontend metadata use `camelCase` (`projectId`, `readinessStatus`).
  * Canonical ingested source fields and AI verification fields preserve strict `snake_case` (`source_id`, `created_at`, `updated_at`, `imported_at`, `redacted_content`, `verbatim_excerpt`, `verification_status`) to maintain zero-translation compatibility across Node.js, MongoDB, and Python Pydantic schemas.
* **Timestamps:** Strictly UTC ISO-8601 strings (`YYYY-MM-DDTHH:mm:ss.sssZ`).

### 2.3 Unified Response Envelope
Every endpoint returns a deterministic JSON envelope containing a boolean `success` flag:

#### Success Response (`200 OK`, `201 Created`)
```json
{
  "success": true,
  "message": "Resource processed successfully",
  "data": { ... }
}
```

#### Zod Validation Error (`400 Bad Request`)

Generated via `schema.safeParse(req.body).error.flatten().fieldErrors`:

```json
{
  "success": false,
  "error": "Validation failed",
  "errors": {
    "email": ["Invalid email address"],
    "password": ["Password must contain at least one uppercase letter"]
  }
}
```

#### Authorization / Business Gate Error (`401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`)

```json
{
  "success": false,
  "error": "Access denied. Requires one of roles: [leader]"
}
```

### 2.4 HTTP Status Code Standards

| Status Code | Meaning in Sanchaya |
| --- | --- |
| `200 OK` | Synchronous read, update, verification, or state transition succeeded. |
| `201 Created` | User registered, workspace provisioned, or source batch ingested. |
| `400 Bad Request` | Zod schema validation failure, unsupported MIME type, or expired reset token. |
| `401 Unauthorized` | Missing `Authorization: Bearer <token>` header or invalid login credentials. |
| `403 Forbidden` | Valid JWT, but role is disallowed OR Handover Readiness Checklist is not `Approved for Sharing`. |
| `404 Not Found` | Requested `projectId`, `sourceId`, `findingId`, or `questionId` does not exist. |
| `409 Conflict` | Duplicate registration email or conflicting state transition. |
| `413 Payload Too Large` | Uploaded file exceeds the Multer 10 MB limit. |
| `500 Internal Server Error` | Unhandled server exception or downstream microservice failure. |

---

## 3. Authentication & Role-Based Access Control (RBAC)

### 3.1 Stateless JWT Claims

Issued upon `POST /api/auth/register` and `POST /api/auth/login` (default TTL: `24h`):

```json
{
  "userId": "672f8b9c1a2b3c4d5e6f7a8b",
  "email": "ayush@nmiet.edu.in",
  "role": "leader | outgoing | incoming",
  "iat": 1762689000,
  "exp": 1762775400
}
```

### 3.2 Three-Tier RBAC Enforcement Rules

1. **`leader` (Team Leader / Mentor):** Full control over workspace creation, member assignment, AI reconstruction triggers, finding edits/approvals, and Readiness Checklist sign-off.
2. **`outgoing` (Departing Contributor):** Authorized to upload meeting notes/task CSVs, connect/sync GitHub repositories, inspect sources/gaps, and submit answers to gap questions (automatically badged `Self-reported`). Cannot approve findings or sign off on readiness.
3. **`incoming` (Onboarding Contributor):**
* **Hard Source & Draft Isolation:** Strictly blocked (`403 Forbidden`) from `/sources`, `/findings`, `/gaps`, and `/gap-questions`.
* **Readiness Gate:** Blocked (`403 Forbidden`) from `/handover` and `/handover/export-pdf` until `project.readinessStatus === "Approved for Sharing"`.

---

## 4. Complete External REST API Reference

### 4.1 Authentication & Profile (`src/routes/auth.ts`)

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | Public | Registers user (`name`, `email`, `password`, `role`) and returns JWT. |
| `POST` | `/api/auth/login` | Public | Verifies credentials via `bcrypt` and issues signed JWT. |
| `POST` | `/api/auth/forgot-password` | Public | Generates 15-min SHA-256 reset token (always returns `200 OK` to prevent enumeration). |
| `POST` | `/api/auth/reset-password` | Public | Verifies raw `token` against SHA-256 DB hash + TTL and updates `passwordHash`. |
| `GET` | `/api/auth/me` | `leader`, `outgoing`, `incoming` | Returns authenticated user profile (`-passwordHash`). |

---

### 4.2 Workspace & Project Management (`src/routes/projects.ts`)

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| `POST` | `/api/projects` | `leader` | Creates workspace and initializes the 7-point readiness checklist to `Needs Attention`. |
| `GET` | `/api/projects` | `leader`, `outgoing`, `incoming` | Lists projects where the authenticated user is an assigned member. |
| `GET` | `/api/projects/:projectId` | `leader`, `outgoing`, `incoming` | Retrieves project details, member roster, and current `readinessStatus`. |
| `POST` | `/api/projects/:projectId/members` | `leader` | Assigns `outgoing` and `incoming` user IDs/emails to the workspace. |

---

### 4.3 Stage 1 (Connect): Multi-Source Ingestion (`src/routes/uploads.ts`, `src/routes/github.ts`)

All ingestion routes synchronously run `secretScanner.ts` to replace credentials/tokens with `[REDACTED_SECRET]` and personal emails/phones with `[REDACTED_PII]` **before** saving to MongoDB.

| Method | Endpoint | Roles | Request Payload | Output & Canonical ID |
| --- | --- | --- | --- | --- |
| `POST` | `/api/projects/:projectId/uploads/notes` | `leader`, `outgoing` | `multipart/form-data` (`file`: `.pdf`, `.docx`, `.txt`, max 10 MB) | Paragraphs normalized into `SRC-DOC-xxx` with `redactionCount` |
| `POST` | `/api/projects/:projectId/uploads/tasks` | `leader`, `outgoing` | `multipart/form-data` (`file`: `.csv`, max 10 MB) | Task rows normalized into `SRC-TSK-xxx` |
| `POST` | `/api/projects/:projectId/github/connect` | `leader`, `outgoing` | `{ "repo": "owner/repo", "accessToken": "ghp_..." }` | Validates read-only repository access |
| `POST` | `/api/projects/:projectId/github/sync` | `leader`, `outgoing` | `{ "branches": ["main", "develop"], "limit": 100 }` | Commits, PRs, and issues normalized into `SRC-GH-xxx` |
| `GET` | `/api/projects/:projectId/sources` | `leader`, `outgoing` | Query: `?type=github_commit|meeting_note|task_csv` | Returns redacted `SourceRecord[]` (`403` for `incoming`) |
| `GET` | `/api/projects/:projectId/sources/:sourceId` | `leader`, `outgoing` | — | Returns single `SourceRecord` (`403` for `incoming`) |

**Canonical `SourceRecord` Response Object:**

```json
{
  "source_id": "SRC-GH-014",
  "projectId": "672f...",
  "source_type": "github_commit",
  "title": "fix(webhook): handle Stripe signature timeout",
  "author": "ayush-nirmal",
  "redacted_content": "Updated webhook secret handler using [REDACTED_SECRET] fallback.",
  "metadata": {
    "commitSha": "9f8e7d6c",
    "filesChanged": ["src/services/webhook.ts"],
    "redactionCount": 1
  },
  "created_at": "2026-10-20T11:15:00.000Z",
  "updated_at": "2026-10-20T11:15:00.000Z",
  "imported_at": "2026-11-09T14:22:10.000Z"
}
```

---

### 4.4 Stages 2 & 3 (Reconstruct & Verify): Findings (`src/routes/findings.ts`)

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| `POST` | `/api/projects/:projectId/reconstruct` | `leader` | Triggers `ai-engine` extraction/validation and `analytics-service` risk calculation. |
| `GET` | `/api/projects/:projectId/findings` | `leader`, `outgoing` | Lists extracted findings with 4-state verification badges (`403` for `incoming`). |
| `PATCH` | `/api/projects/:projectId/findings/:findingId` | `leader` | Edits claim text, owner, or category of a candidate finding. |
| `POST` | `/api/projects/:projectId/findings/:findingId/approve` | `leader` | Marks finding `review_status: "approved"` and re-evaluates readiness checklist. |
| `POST` | `/api/projects/:projectId/findings/:findingId/reject` | `leader` | Marks finding `review_status: "rejected"` (excluded from final handover). |

**`Finding` Response Object:**

```json
{
  "_id": "672f99...",
  "projectId": "672f...",
  "category": "decision",
  "claim": "Chose stateless JWTs over Redis session store to simplify container scaling.",
  "owner": "ayush-nirmal",
  "source_id": "SRC-DOC-003",
  "verbatim_excerpt": "decided to use stateless JWTs instead of Redis to avoid extra container state",
  "verification_status": "Supported",
  "evidence_origin": "system_verified",
  "freshness": {
    "source_updated_at": "2026-10-18T14:10:00.000Z",
    "recheck_recommended": false,
    "reason": null
  },
  "review_status": "approved"
}
```

* **Allowed `verification_status` values:** `Supported`, `Needs review`, `Conflicting`, `Unknown`.
* **Allowed `evidence_origin` values:** `system_verified`, `self_reported`.

---

### 4.5 Stage 4 (Review): Knowledge Gaps, Risk Map & Readiness (`src/routes/gaps.ts`, `src/routes/readiness.ts`)

| Method | Endpoint | Roles | Description |
| --- | --- | --- | --- |
| `GET` | `/api/projects/:projectId/gaps` | `leader`, `outgoing` | Lists unresolved gaps (`Unknown` or `Conflicting` findings, unowned tasks). |
| `GET` | `/api/projects/:projectId/gap-questions` | `leader`, `outgoing` | Lists targeted micro-questions generated for the outgoing contributor. |
| `POST` | `/api/projects/:projectId/gap-questions/:questionId/answer` | `outgoing` | Submits outgoing member's response; stores with `evidence_badge: "Self-reported"`. |
| `GET` | `/api/projects/:projectId/risk-map` | `leader` | Retrieves deterministic Contribution Concentration Risk Map (bus-factor warnings). |
| `GET` | `/api/projects/:projectId/readiness` | `leader`, `outgoing` | Returns the 7-point Handover Readiness Checklist evaluation. |
| `POST` | `/api/projects/:projectId/readiness/sign-off` | `leader` | Records leader approval; transitions state to `Approved for Sharing` if all 7 criteria pass. |

**`ReadinessChecklist` Response Object (`GET /api/projects/:projectId/readiness`):**

```json
{
  "success": true,
  "data": {
    "readinessStatus": "Ready for Review",
    "criteria": {
      "sourcesVerified": true,
      "decisionsBackedByEvidence": true,
      "unfinishedTasksAssignedOrUnknown": true,
      "blockersIdentified": true,
      "conflictsDisclosed": true,
      "recipientPermissionsChecked": true,
      "leaderApprovalRecorded": false
    }
  }
}
```

---

### 4.6 Stage 5 (Handover): Approved Delivery & PDF Export (`src/routes/handover.ts`)

| Method | Endpoint | Roles | Guard Condition & Behavior |
| --- | --- | --- | --- |
| `GET` | `/api/projects/:projectId/handover` | `leader`, `incoming` | Returns approved continuation plan, verified decisions, open gaps, and risk map. Returns `403` for `incoming` unless `readinessStatus === "Approved for Sharing"`. |
| `GET` | `/api/projects/:projectId/handover/export-pdf` | `leader`, `incoming` | Streams `application/pdf` generated via ReportLab (`Content-Disposition: attachment; filename="sanchaya-handover-<projectId>.pdf"`). Enforces the same readiness guard. |
| `POST` | `/api/projects/:projectId/handover/acknowledge` | `incoming` | Logs timestamped receipt acknowledgement from the incoming member. |
| `GET` | `/api/projects/:projectId/handover/history` | `leader`, `incoming` | Returns version snapshots and incoming member acknowledgement logs. |

---

## 5. Internal Microservice Contracts (`pythonBridge.ts`)

These endpoints are strictly internal to the `sanchaya-network` Docker bridge and are never exposed directly to the public internet.

### 5.1 Node.js Gateway -> AI Engine (`http://ai-engine:8001`)

* **`POST /internal/extract-and-verify`**
* **Request Body:** `{ "projectId": "672f..." }`
* **Behavior:** Reads redacted `source_records` from MongoDB, prompts the LLM using strict Pydantic JSON schemas, runs deterministic substring verification (`evidence_validator.py`), checks source freshness timestamps, populates `findings`, and generates `gap_questions` for `Unknown` items.
* **Response (`200 OK`):** `{ "success": true, "findingsCount": 18, "supportedCount": 12, "gapsGenerated": 4 }`

### 5.2 Node.js Gateway -> Analytics Service (`http://analytics-service:8002`)

* **`POST /internal/compute-risk-and-readiness`**
* **Request Body:** `{ "projectId": "672f..." }`
* **Behavior:** Analyzes `SRC-GH-*` commit histories and `SRC-TSK-*` task distributions to write the `risk_maps` document and evaluates the 7-point readiness rules.

* **`GET /internal/generate-pdf/:projectId`**
* **Response (`200 OK`):** Binary PDF stream (`application/pdf`) piped by the Node.js gateway back to the authorized client.
