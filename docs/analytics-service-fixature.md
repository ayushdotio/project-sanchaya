# `services/analytics-service` Audit, Alignment & Fixature Plan

> **Basis:** Individual Contribution Report (*Prakhar Raj | Team Epsilum — CodeFrontier Hackathon 2026, Round 1*) and cross-service verification against `services/backend`, `docker-compose.yaml`, `docs/database/database-schema.md`, and `AGENTS.md`.
>
> **Reviewed:** 2026-11-11

---

## 1. Executive Summary

`services/analytics-service` implements all four deterministic components and the synthetic evaluation asset described in Prakhar Raj's Individual Contribution Report (`risk_analyzer.py`, `readiness/engine.py`, `handover/assembly.py`, `pdf_generator.py`, `data/synthetic/generate.py`, and 37 tests in `tests/`).

However, **it cannot currently integrate with `services/backend` or the shared MongoDB database**, contains **a `TypeError` crash in `risk_analyzer.py` on bot-only commit histories**, **lacks role-scope filtering in `assembly.py`**, and **diverges from the canonical Mongoose schemas and `pythonBridge.ts` endpoints**. Additionally, running `python -m pytest -v` locally fails unless `pytest` and dependencies from `requirements.txt` are installed in the active Python environment, and `tests/test_pdf.py` crashes when `pdftotext` is absent due to a statement-order bug.

---

## 2. Alignment Matrix (PDF Spec vs. Current Implementation & Backend Integration)

| PDF Deliverable / Module | PDF Requirement | Current Status in `services/analytics-service` |
| :--- | :--- | :--- |
| **3.1 Contribution Concentration Risk Analyzer** (`risk_analyzer.py`) | Deterministic identity merge, bot filtering, grouping by **module/dir, file hotspots, and task groups**, recent-window (90d) vs. all-time share, simplified bus-factor, `High`/`Medium`/`Low`/`Insufficient data`, departing-member open/blocked tasks & **tasks with no second contributor** | **Mostly Implemented (with gaps/bug)** — identity merge, bot exclusion, 90d window, bus factor, and module/file scoring exist; **missing task-group concentration & second-contributor task check**; **crashes (`TypeError`) when all commits are bot commits** |
| **3.2 Handover Readiness Checklist Engine** (`readiness/engine.py`) | 7 rules (`Needs Attention`, `Ready for Review`, `Approved for Sharing`), per-rule failure reasons, SHA-256 snapshot hash invalidating approval on change | **Implemented (schema mismatch)** — pure 7-rule evaluator & SHA-256 hash work on custom `analytics_projects` dict shape, but field names do not match MongoDB `SourceRecord` / `Finding` / `Project` models, and `required_source_types` is not enforced by default |
| **3.3 Role-Filtered Handover Assembly, Versions & Receipts** (`handover/assembly.py`, `routers_prakhar.py`) | Approved-only assembly, **role & `recipient.scope` filtering**, immutable numbered SHA-256 versions, incoming receipt log | **Partial** — approval gating, immutable versions, and receipts work in-memory/`analytics_projects`; **`recipient.scope` is checked in Rule 6 (`engine.py:97`) but never applied to filter sections in `assembly.py`**; disconnected from `services/backend` `HandoverHistory` |
| **3.4 Evidence-Linked PDF Export** (`pdf/pdf_generator.py`) | ReportLab PDF with readiness summary, decision timeline, tasks, dependencies, risk map, open gaps, next actions, source IDs, text status labels, freshness notes, version & content hash footer | **Mostly Implemented (gaps)** — clean ReportLab table layout with version/hash footer and `escape()` XSS-safe cells; **freshness only shown on decisions (omitted on dependencies, blockers, open gaps)**; **no `Self-reported` gap-answer section**; empty-list handling inconsistent across sections |
| **3.5 Synthetic Evaluation Dataset** (`data/synthetic/generate.py`) | Seeded reproducible 4-student project with planted silos, unowned tasks, blocked task without blocker, contradictory notes, fake secrets/PII, and `answer_key.json` | **Implemented** — seeded (`SEED = 42`) generator + pre-generated JSON/TXT fixtures and `answer_key.json` |
| **Backend & Docker Integration** (`pythonBridge.ts`, `docker-compose.yaml`) | `POST /internal/compute-risk-and-readiness` & `GET /internal/generate-pdf/{projectId}` over shared MongoDB `sanchaya` | **Broken** — `/internal/*` endpoints do not exist; `docker-compose.yaml` omits `MONGO_URI` for `analytics-service`; `MongoStore` uses an isolated `analytics_projects` JSON-string collection instead of `projects`, `source_records`, `findings`, `gap_questions`, `risk_maps`, and `handover_history` |

---

## 3. Blockers (Critical Issues)

### BL-01: Missing `/internal/*` endpoints expected by `services/backend` (`pythonBridge.ts`)
- **Locations:**
  - `services/analytics-service/app/routers_prakhar.py:18-195`
  - `services/backend/src/services/pythonBridge.ts:14-21,54-86`
  - `services/backend/src/controllers/readiness.controller.ts:31-64`
  - `services/backend/src/controllers/handover.controller.ts:77-95`
- **Issue:** `services/backend/src/services/pythonBridge.ts` invokes two endpoints on `http://analytics-service:8002`:
  1. `POST /internal/compute-risk-and-readiness` with body `{ "projectId": "<id>" }`, expecting `RiskAndReadinessResponse`:
     ```json
     {
       "success": true,
       "message": "...",
       "readinessStatus": "Needs Attention | Ready for Review | Approved for Sharing",
       "checklist": {
         "sourcesVerified": true,
         "decisionsBackedByEvidence": true,
         "unfinishedTasksAssignedOrUnknown": true,
         "blockersIdentified": true,
         "conflictsDisclosed": true,
         "recipientPermissionsChecked": true,
         "leaderApprovalRecorded": false
       },
       "riskSummary": { ... }
     }
     ```
  2. `GET /internal/generate-pdf/{projectId}`, expecting a binary `application/pdf` stream (`responseType: "stream"`).
  Neither route exists in `services/analytics-service`, which only exposes `/projects/{pid}/...` routes expecting custom `X-Role` / `X-User-Id` headers and an `analytics_projects` snapshot. Consequently, `GET /api/projects/:projectId/risk-map`, `POST /api/projects/:projectId/readiness/evaluate`, and `GET /api/projects/:projectId/handover/export-pdf` in `services/backend` all fail with `404 Not Found`.
- **Fix:** Add an internal FastAPI router (`app/routers_internal.py`) mounted in `app/main.py` implementing:
  - `POST /internal/compute-risk-and-readiness`: loads canonical MongoDB documents (`projects`, `source_records`, `findings`, `gap_questions`, `handover_history`) by `ObjectId(projectId)`, maps them to `risk_analyzer.analyze()` and `readiness.engine.evaluate()`, persists `risk_maps` and updates `projects.readinessChecklist` / `projects.readinessStatus`, and returns the exact `RiskAndReadinessResponse` envelope.
  - `GET /internal/generate-pdf/{project_id}`: loads the approved snapshot (or latest `handover_history` + approved `findings` + `gap_questions` + `risk_maps`), verifies `readinessStatus == "Approved for Sharing"`, renders the PDF into an in-memory `io.BytesIO` buffer (or temp file), and returns `StreamingResponse(..., media_type="application/pdf")`.

---

### BL-02: Isolated `analytics_projects` store & missing `MONGO_URI` in `docker-compose.yaml`
- **Locations:**
  - `services/analytics-service/app/store.py:45-85`
  - `docker-compose.yaml:70-80`
  - `docs/database/database-schema.md:22-150`
  - `services/backend/src/models/Project.ts`, `SourceRecord.ts`, `Finding.ts`, `HandoverHistory.ts`
- **Issues:**
  1. `docker-compose.yaml:70-80` defines `analytics-service` **without** `MONGO_URI=${MONGO_URI}` or `depends_on: [mongo]`. At startup, `make_store()` (`store.py:80-82`) sees `MONGO_URI` is unset and falls back to `ProjectStore` (volatile in-memory dictionary), losing all state on container restart and seeing none of the records ingested by `services/backend`.
  2. Even when `MONGO_URI` is provided, `MongoStore` (`store.py:45-77`) reads and writes JSON strings into an isolated collection `analytics_projects` (`{_id: pid, doc: "<json>"}`) instead of the shared Sanchaya collections (`projects`, `source_records`, `findings`, `gap_questions`, `risk_maps`, `handover_history`).
  3. `STORE = make_store()` executes at module import time (`store.py:85`), and neither `app/main.py` nor `app/store.py` calls `load_dotenv()` for the repo root `.env`.
- **Fix:**
  1. Update `docker-compose.yaml` for `analytics-service` to inject `MONGO_URI=${MONGO_URI}` and `depends_on: [mongo]`.
  2. Add root `.env` discovery via `python-dotenv` (matching `services/backend/src/config/env.ts:9-24`) for local runs.
  3. Implement a canonical MongoDB repository layer reading `projects`, `source_records`, `findings`, and `gap_questions`, and persisting `risk_maps` + `handover_history` (keeping `ProjectStore` / `MongoStore` available for unit tests).

---

### BL-03: `risk_analyzer.py` crashes with `TypeError` when all commits are bot commits
- **Locations:** `services/analytics-service/app/analytics/risk_analyzer.py:102-146`
- **Issue:** In `analyze()`:
  - Lines 127–134 compute `as_of = max((parse_ts(c["timestamp"]) for c in commits if not is_bot(...)), default=None)`.
  - If `commits` is non-empty but every commit is from a bot (e.g., `dependabot[bot]`), `as_of` evaluates to `None`.
  - Line 139 (`if commits:`) still evaluates `True`, calling `_group(commits, ..., as_of=None)` at line 143.
  - Line 103 executes `window_start = as_of - timedelta(days=cfg["window_days"])` -> **`TypeError: unsupported operand type(s) for -: 'NoneType' and 'datetime.timedelta'`**.
- **Fix:** Fallback `if as_of is None:` to `max((parse_ts(c["timestamp"]) for c in commits), default=datetime.now(timezone.utc))` or skip grouping when no human commits exist.

---

### BL-04: Gaps against PDF Sections 3.1, 3.3 & 3.4 (Task-group risk, second contributor, scope filtering, PDF completeness)
- **Locations:**
  - `services/analytics-service/app/analytics/risk_analyzer.py:152-177`
  - `services/analytics-service/app/handover/assembly.py:41-59,120-136`
  - `services/analytics-service/app/pdf/pdf_generator.py:45-68`
- **Issues:**
  1. **Missing second-contributor task check (PDF 3.1 Step 6):** PDF p. 2 requires *"Count open or blocked tasks assigned to the departing member and flag tasks with no second contributor."* `risk_analyzer.py:153-162` tracks `unowned`, `blocked_without_blocker`, and `departing_member_open_tasks`, but never flags tasks lacking a second contributor/reviewer.
  2. **Missing task-group risk breakdown (PDF 3.1 Step 2 & p. 5):** PDF 3.1 requires grouping by module/directory, file hotspots, **and task group**. `risk_analyzer.py` only produces `units` and `hotspot_files`.
  3. **PDF & handover assembly omit `hotspot_files` and `task_risk` details (`assembly.py:56-59`, `pdf_generator.py:59-61`):** `build_content` only embeds `units` (`High`/`Medium`), discarding `hotspot_files` and `task_risk` summary counts.
  4. **Role-scope filtering not enforced (`assembly.py:120-136`):** `readiness/engine.py:97` requires `recipient["scope"]` to be non-empty, and PDF 3.3 states *"The same stored handover is rendered differently per role... Unapproved items and items failing the checklist are removed before the response is built"*, yet `assembly.get_handover()` ignores `recipient["scope"]` and returns all sections unconditionally.
  5. **PDF missing freshness badges on non-decision sections & missing `Self-reported` gap answers (`pdf_generator.py:45-68`):**
     - PDF 3.4 specifies *"Each claim shows its source ID, a text status label (never colour alone) and a freshness note."* Currently only Section 1 (`Decisions`) includes `Status` and `Freshness`; Section 3 (`Dependencies and known problems`) omits status and freshness, and Section 5 (`Open gaps`) omits freshness and conflicting source links.
     - Gap answers submitted by the outgoing member (`GapQuestion` with `evidence_badge: "Self-reported"`, required by `AGENTS.md` Invariant 5 and `handover.controller.ts:54-57`) are not rendered in `assembly.py` or `pdf_generator.py`.
     - Sections 2 (`Open tasks`), 4 (`Knowledge-risk areas`), and 6 (`Prioritised next actions`) lack empty-list fallback rows (`or [["-"] * N]`), unlike Sections 1 and 5.
- **Fix:**
  - Add task-group concentration & single-contributor task flags to `risk_analyzer.py`.
  - Filter assembled handover sections in `assembly.get_handover()` by `recipient["scope"]` when `role == "incoming"`.
  - Add freshness + status labels to dependencies/blockers/gaps, include a `Self-reported` gap-answers table, include file hotspots in risk summary, and add empty-state rows to all PDF tables.

---

### BL-05: `readiness/engine.py` schema mismatch with MongoDB models & un-enforced `required_source_types`
- **Locations:**
  - `services/analytics-service/app/readiness/engine.py:44-100`
  - `services/analytics-service/app/routers_prakhar.py:121-125`
  - `services/backend/src/models/SourceRecord.ts`, `Finding.ts`, `Project.ts`
- **Issues:**
  1. `engine.py:56-60` expects `sources` to have `timestamp` and `scan_completed` (`bool`), whereas MongoDB `SourceRecord` stores `created_at`, `updated_at`, `imported_at`, and `metadata.redactionCount` (no `scan_completed` boolean).
  2. `engine.py:67-89` expects `findings` to have `id`, `text`, `status`, `reviewer_signoff`, `resolved`, whereas MongoDB `Finding` stores `_id`, `claim`, `verification_status`, `review_status` (`"pending" | "approved" | "rejected"`), and `verbatim_excerpt`.
  3. `engine.py:61` checks `required_source_types - {s.get("type") for s in sources}`, which is a no-op (`set()`) whenever `required_source_types` is omitted — and `routers_prakhar.py:124` calls `evaluate(_project(pid))` without passing `required_source_types` (PDF p. 3 Rule 1: *"At least one source of each planned type is imported"*).
  4. `engine.py:74-82` evaluates tasks solely from `project["tasks"]` (`open`/`blocked`), while MongoDB stores tasks across `source_records` (`source_type: "task"`) and `findings` (`category: "task" | "blocker"`).
- **Fix:** Create a deterministic mapper converting MongoDB `Project`, `SourceRecord`, `Finding`, and `GapQuestion` documents into the normalized snapshot consumed by `evaluate()`, and configure default/project-level `required_source_types` (e.g., `["github", "document", "task"]` or `project.plannedSourceTypes`).

---

### BL-06: Broken `tests/test_pdf.py` ordering bug + duplicate route decorator in `routers_prakhar.py`
- **Locations:**
  - `services/analytics-service/tests/test_pdf.py:11-13`
  - `services/analytics-service/app/routers_prakhar.py:72-74`
- **Issues:**
  1. `tests/test_pdf.py:11` invokes `subprocess.run(["pdftotext", "-layout", path, "-"], ...)` **before** line 12 checks `if shutil.which("pdftotext") is None: pytest.skip(...)`. On Windows or minimal containers without `poppler-utils`, line 11 raises `FileNotFoundError` before `pytest.skip` can execute (and when `pdftotext` *is* installed, it runs twice).
  2. `routers_prakhar.py:72-73` stacks `@router.put("/{pid}/data")` twice consecutively on `put_data`, registering duplicate route entries.
- **Fix:** Move `if shutil.which("pdftotext") is None: pytest.skip(...)` before `subprocess.run(...)` and remove the duplicate `subprocess.run` and duplicate `@router.put("/{pid}/data")` decorator.

---

## 4. Warnings

### WR-01: Unauthenticated `X-Role` / `X-User-Id` header trust on host-exposed port `8002`
- **Locations:** `services/analytics-service/app/routers_prakhar.py:28-34`, `docker-compose.yaml:75-76`
- **Issue:** `docker-compose.yaml` publishes `8002:8002` to the host, and `identity()` trusts arbitrary `X-Role: leader` / `X-User-Id` headers without checking a shared internal token or verifying a JWT. Any local caller on port `8002` can impersonate a leader or overwrite project data via `PUT /projects/{pid}/data`.
- **Fix:** Enforce an `X-Internal-Token` shared secret (or verify JWTs directly when called outside the gateway) and remove public host port mapping in production.

### WR-02: Backend `Project.readinessStatus` drifts if content changes after approval
- **Locations:** `services/analytics-service/app/readiness/engine.py:102-112`, `services/backend/src/controllers/handover.controller.ts:24-27`
- **Issue:** In `analytics-service`, modifying a finding or source invalidates `snapshot_hash` dynamically so `evaluate()` drops from `Approved for Sharing` back to `Ready for Review` / `Needs Attention`. However, `services/backend`'s `verifyHandoverAccess` (`handover.controller.ts:24-27`) checks `project.readinessStatus !== "Approved for Sharing"` directly in MongoDB. If `analytics-service` doesn't sync `readinessStatus` back to `projects` whenever evaluation or data mutation occurs, `services/backend` can still serve stale approved access to an incoming member.
- **Fix:** Sync computed `readinessStatus` and `readinessChecklist` back to MongoDB `projects` (and invalidate `approvedBy`/`approvedAt` if hash mismatch occurs) during `/internal/compute-risk-and-readiness` and project mutations.

### WR-03: Non-atomic `replace_one` in `MongoStore.put` risks lost updates on concurrent approvals/receipts
- **Locations:** `services/analytics-service/app/store.py:62-63`
- **Issue:** `MongoStore.put()` overwrites the entire project document with `replace_one(..., upsert=True)` without optimistic locking or version checks. Concurrent `approve` and `acknowledge` requests can clobber each other's `versions` or `receipts`.
- **Fix:** Persist immutable handover versions and receipts in `handover_history` using atomic inserts/updates with a unique index on `{ projectId: 1, version: 1 }`.

### WR-04: `pdf_generator.py` writes temporary files to disk instead of streaming `BytesIO`
- **Locations:** `services/analytics-service/app/pdf/pdf_generator.py:26-72`, `services/analytics-service/app/routers_prakhar.py:186-195`
- **Issue:** `routers_prakhar.py` creates a temp file via `tempfile.mkstemp(...)`, writes the PDF to disk, and cleans it up in a `BackgroundTask`. Streaming via an in-memory `io.BytesIO` buffer avoids temp-file disk I/O and cleanup edge cases when serving `GET /internal/generate-pdf/{projectId}`.
- **Fix:** Support `BytesIO | str` as the `target` parameter in `generate_pdf()` so both CLI (`run_demo.py` file output) and FastAPI streaming (`BytesIO`) use the exact same renderer.

### WR-05: Unpinned dependencies in `requirements.txt` & missing `pytest` in local Python
- **Locations:** `services/analytics-service/requirements.txt:1-9`
- **Issue:** All 9 packages (`fastapi`, `uvicorn`, `pydantic`, `reportlab`, `pymongo`, `python-dotenv`, `pytest`, `httpx`, `mongomock`) lack version constraints, risking breaking changes across installs. (Note: `python -m pytest` also failed in the current host Python environment because `pytest` is not installed globally; tests must run inside the service venv or Docker container.)
- **Fix:** Pin tested compatible version ranges in `requirements.txt` and document/use a dedicated virtualenv or Docker test command.

---

## 5. Info / Code Quality Notes

- **IN-01 (Code structure):** `services/analytics-service/app/routers_prakhar.py:72-73` has a duplicate `@router.put("/{pid}/data")` decorator.
- **IN-02 (Hotspot visibility):** `risk_analyzer.py:147,173` only surfaces `High`-level file hotspots (and truncates to top 10 without `total_hotspots` count). Including `Medium` file hotspots or a `total_hotspots` count improves leader visibility.
- **IN-03 (Cover-50% edge case):** `risk_analyzer.py:60-65` assumes `per_author` is non-empty (always true in `_group`), and stops once `acc >= cover_target * total`. Worth adding a unit test for single-commit units and bot-only commits.

---

## 6. Recommended Revival Execution Order

1. **Unblock Docker & Canonical DB Integration:** Add `MONGO_URI=${MONGO_URI}` and `depends_on: [mongo]` for `analytics-service` in `docker-compose.yaml`; add root `.env` loading in `analytics-service` and a MongoDB adapter reading `projects`, `source_records`, `findings`, `gap_questions` and writing `risk_maps` / `handover_history`.
2. **Wire `services/backend` (`pythonBridge.ts`):** Implement `POST /internal/compute-risk-and-readiness` and `GET /internal/generate-pdf/{project_id}` returning the exact `RiskAndReadinessResponse` JSON and PDF stream expected by `services/backend`.
3. **Fix Critical Logic & Test Bugs:**
   - Guard `as_of is None` when all commits are bots in `risk_analyzer.py`.
   - Fix `tests/test_pdf.py` `shutil.which("pdftotext")` check order and remove duplicate `@router.put("/{pid}/data")` in `routers_prakhar.py`.
4. **Close Remaining PDF Spec Gaps:**
   - Add task-group concentration & single-contributor task flags in `risk_analyzer.py`.
   - Enforce `recipient.scope` filtering in `assembly.get_handover()`.
   - Render freshness labels across all finding categories, include `Self-reported` gap answers in `assembly.py` + `pdf_generator.py`, and add empty-row fallbacks for all PDF tables.
   - Sync `readinessStatus` invalidation back to MongoDB `projects` when underlying findings/sources change.
5. **Harden Security & Packaging:** Require an internal service token header on internal/service routes, switch PDF HTTP response to `BytesIO` streaming, and pin dependency ranges in `requirements.txt`.

