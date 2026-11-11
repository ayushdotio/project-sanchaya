# `services/ai-engine` Audit, Alignment & Fixature Plan

> **Basis:** Individual Contribution Report (*Varad Gaikwad | Team EPSILUM — CodeFrontier Hackathon 2026, Round 1*) and cross-service verification against `services/backend`, `docker-compose.yaml`, `docs/database/database-schema.md`, and `AGENTS.md`.
>
> **Reviewed:** 2026-11-11

---

## 1. Executive Summary

While the 15 existing unit tests in `services/ai-engine/tests/` pass when invoked directly inside `services/ai-engine` (`python -m unittest discover -s tests -v`), **`services/ai-engine` currently cannot boot as the FastAPI microservice inside Docker, cannot respond to `services/backend` (`PythonBridge`), writes to the wrong MongoDB database/collection, and is missing or misaligned on core modules specified in the Individual Contribution Report**.

---

## 2. Alignment Matrix (PDF Spec vs. Current Implementation)

| PDF Deliverable / Module | PDF Requirement | Current Status in `services/ai-engine` |
| :--- | :--- | :--- |
| **Module 1:** `ai_extractor` (Stage 2: Reconstruct) | LLM prompt with strict JSON schema + Pydantic validation extracting decisions, task ownership, blockers, dependencies, and unresolved context with `source_id` & `verbatim_excerpt` from `source_records` | **Missing** — no LLM client, no prompt, no extractor module, no `source_records` reader |
| **Module 2:** `evidence_validator` (Stage 3: Verify) | Look up cited `source_id` in MongoDB, check excerpt substring against stored record, enforce 4 states (`Supported`, `Needs review`, `Conflicting`, `Unknown`) | **Partial** — checks in-memory strings only (no MongoDB `source_records` lookup); uses wrong enum casing; missing partial-match, single-informal-note, and missing-owner/deadline rules |
| **Freshness Monitoring** (Stage 3) | Read `created_at`, `updated_at`, and `imported_at` on `source_records`; compare against newer project activity; attach `Re-check Recommended` indicator alongside status | **Misaligned** — checks `submitted_at < now - 90d` on an unreferenced `self_reported_evidence` collection |
| **Temporal Conflict Detection** (Stage 3) | Compare earlier project notes with newer commits/PRs/tasks about the same item; mark `Conflicting` and preserve **both versions with timestamps & source links** for human review | **Partial / Buggy** — requires pre-grouped `DecisionFact` objects with `supersedes_source_id`; returns only a `bool` and discards conflicting sources/timestamps |
| **Module 3:** `gap_detector` (Stages 3–4) | Deterministic detection of: (1) missing owners, (2) missing rationales, (3) unresolved/`Unknown` items, (4) `Conflicting` sources | **Missing** — no `gap_detector` module exists |
| **Module 4:** `question_generator` (Stage 4: Review) | LLM phrases focused questions for backend-detected gaps; replies stored with `Self-reported` label separate from system-verified evidence | **Partial** — static `if/elif` template string builder; no LLM phrasing; writes to wrong collection/schema |
| **Backend & Docker Integration** | `POST /internal/extract-and-verify` called by `PythonBridge.triggerExtractionAndVerify`; runs via `Dockerfile` on port `8001` | **Broken** — route missing; Docker falls back to `python3 -m http.server 8001`; DB name and env loading mismatch root config |

---

## 3. Blockers (Critical Issues)

### BL-01: Docker startup silently falls back to `python3 -m http.server 8001`
- **Locations:**
  - `services/ai-engine/Dockerfile:28`
  - `docker-compose.yaml:58-68`
- **Issue:** `services/ai-engine/Dockerfile:28` runs:
  ```sh
  if [ -f main.py ]; then (uvicorn main:app --host 0.0.0.0 --port 8001 --reload 2>/dev/null || python main.py); else python3 -m http.server 8001; fi
  ```
  Because the FastAPI app lives at `services/ai-engine/app/main.py` and there is no root `services/ai-engine/main.py` (unlike `services/analytics-service/main.py`), Docker silently starts an empty HTTP directory server on port `8001` instead of FastAPI.
- **Fix:**
  1. Add `services/ai-engine/main.py` re-exporting `app`:
     ```python
     from app.main import app  # noqa: F401

     if __name__ == "__main__":
         import uvicorn
         uvicorn.run(app, host="0.0.0.0", port=8001)
     ```
  2. Update `services/ai-engine/Dockerfile:28` to run Uvicorn directly and fail fast rather than falling back to `http.server`:
     ```dockerfile
     CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
     ```

---

### BL-02: Database configuration crashes on import and targets the wrong MongoDB database
- **Locations:**
  - `services/ai-engine/app/database.py:8-20`
  - `services/ai-engine/.dockerignore:28-38`
  - `.env.example:11`
  - `docker-compose.yaml:11,58-68`
- **Issues:**
  1. `app/database.py:8-15` looks only for `services/ai-engine/.env` (`Path(__file__).resolve().parents[1] / ".env"` — excluded by `.dockerignore` and violating `AGENTS.md`'s single root `.env` rule) and raises `ValueError("MONGO_URI is missing from services/ai-engine/.env")` at import time. Meanwhile `docker-compose.yaml:58-68` passes neither `MONGO_URI` nor `OPENAI_API_KEY` to the `ai-engine` container.
  2. `app/database.py:12` defaults `DATABASE_NAME` to `"Sanchaya"` (capital `S`), whereas `.env.example:11` and `docker-compose.yaml:11` use `sanchaya` (lowercase). MongoDB database names are case-sensitive, so `ai-engine` reads/writes a separate database from `services/backend`.
  3. `app/database.py:20` only binds `self_reported_evidence`, ignoring the shared collections used by `services/backend`: `source_records`, `findings`, and `gap_questions`.
- **Fix:**
  1. Walk parent directories to load the root `.env` (mirroring `services/backend/src/config/env.ts:9-24`) and pass `MONGO_URI`, `DATABASE_NAME=sanchaya`, and LLM API keys (`OPENAI_API_KEY`) into `ai-engine` in `docker-compose.yaml`.
  2. Change default `DATABASE_NAME` to `"sanchaya"`.
  3. Replace import-time `MongoClient` creation / `ValueError` with lazy/lifespan initialization (`get_database()`).
  4. Expose `source_records`, `findings`, and `gap_questions` collections.

---

### BL-03: Missing `/internal/extract-and-verify` endpoint expected by `services/backend`
- **Locations:**
  - `services/ai-engine/app/main.py`
  - `services/backend/src/services/pythonBridge.ts:5-12,36-49`
  - `services/backend/src/controllers/findings.controller.ts:114-133`
- **Issue:** `findings.controller.ts:126` invokes `pythonBridge.triggerExtractionAndVerify(projectId)`, which sends:
  - `POST ${AI_SERVICE_URL}/internal/extract-and-verify`
  - Body: `{ "projectId": "<ObjectId string>" }`
  - Expected response (`ExtractionResponse`):
    ```json
    {
      "success": true,
      "message": "...",
      "findingsCount": 0,
      "supportedCount": 0,
      "gapsGenerated": 0
    }
    ```
  This route does not exist in `services/ai-engine/app/main.py`, causing Stage 2/3 reconstruction triggers from the backend to fail with `404`.
- **Fix:** Implement `@app.post("/internal/extract-and-verify")` in `services/ai-engine` to:
  1. Validate `projectId` as a valid `bson.ObjectId` (return `400`/`422` if invalid).
  2. Query `source_records` for `{ "projectId": ObjectId(projectId) }`.
  3. Run **Module 1 (`ai_extractor`)** over `redacted_content` with strict Pydantic validation.
  4. Run **Module 2 (`evidence_validator` + freshness + temporal conflict detection)** against MongoDB `source_records`.
  5. Persist validated findings into `findings`.
  6. Run **Module 3 (`gap_detector`) + Module 4 (`question_generator`)** and persist pending questions into `gap_questions`.
  7. Return `{ "success": True, "message": "...", "findingsCount": ..., "supportedCount": ..., "gapsGenerated": ... }`.

---

### BL-04: Module 1 (`ai_extractor`) from the PDF is completely unimplemented
- **Locations:**
  - `services/ai-engine/app/services/`
  - `services/ai-engine/requirements.txt`
- **Issue:** PDF pages 2–4 specify Stage 2 (`services/ai_extractor`): prompting an LLM with a strict JSON schema to extract `decision`, `task` (with owner/deadline), `blocker`, `dependency`, and unresolved context from normalized, redacted `source_records`, requiring `claim`, `category`, `source_id`, and `verbatim_excerpt` for every candidate finding and rejecting non-conforming output. No extractor, prompt, or LLM SDK exists.
- **Fix:** Create `app/services/ai_extractor.py`:
  - Define strict Pydantic v2 models (`ExtractedFindingCandidate`, `ExtractionBatchOutput`) matching `Finding.ts` (`category` in `{"decision", "task", "blocker", "dependency"}`, `claim`, `source_id`, `verbatim_excerpt`, plus optional `owner`, `deadline`, `rationale`, `topic`).
  - Prompt the LLM to extract candidates solely from `redacted_content`, quote `verbatim_excerpt` verbatim, and never invent missing owners/rationales.
  - Validate responses with `model_validate_json` / `model_validate` (never trust raw unvalidated `json.loads()` per `AGENTS.md`).

---

### BL-05: Schema & Enum mismatches between `ai-engine` and MongoDB / `services/backend`
- **Locations:**
  - `services/ai-engine/app/models/schemas.py:8-27,38-43`
  - `services/backend/src/models/Finding.ts:35-63`
  - `services/backend/src/models/GapQuestion.ts:16-54`
  - `services/backend/src/models/SourceRecord.ts:19-70`
  - `services/backend/src/types/source.types.ts:1-9`
  - `services/backend/src/controllers/gaps.controller.ts:15`
  - `docs/database/database-schema.md:78-119`
- **Issues:**
  1. `EvidenceStatus` in `schemas.py:8-12` defines `"supported"`, `"needs_review"`, `"conflicting"`, `"unknown"` (lowercase/snake_case). `Finding.ts:51`, `gaps.controller.ts:15`, `AGENTS.md`, and PDF page 5 require `"Supported"`, `"Needs review"`, `"Conflicting"`, `"Unknown"`.
  2. `ProjectDecision` (`schemas.py:15-20`) uses `evidence_excerpt`, whereas `Finding.ts:45` and PDF page 3 use `verbatim_excerpt`, plus `projectId` (`ObjectId`), `claim`, `category`, `evidence_origin` (`"system"` vs `"self_reported"` in `Finding.ts:56`), and `review_status` (`"pending"`).
  3. `SelfReportedEvidence` (`schemas.py:38-43`) writes to an unused `self_reported_evidence` collection instead of the `gap_questions` / `findings` flow managed by `gaps.controller.ts`.
  4. **Cross-repo detail to note:** `docs/database/database-schema.md:92` lists `"system_verified"`, while `Finding.ts:56` enforces `enum: ["system", "self_reported"]`. `ai-engine` must write `"system"` to stay compatible with Mongoose validation in `services/backend`.
- **Fix:** Update `EvidenceStatus` values to `"Supported" | "Needs review" | "Conflicting" | "Unknown"` and add canonical Pydantic schemas for `SourceRecordDoc`, `FindingDoc`, and `GapQuestionDoc` matching the Mongoose models.

---

### BL-06: `evidence_validator.py` does not query MongoDB, misses PDF rules, and leaks conflicts across topics
- **Locations:**
  - `services/ai-engine/app/services/evidence_validator.py:46-164`
- **Issues:**
  1. **No MongoDB `source_id` lookup (PDF p. 4–5):** `validate_evidence` accepts a caller-supplied `source_text` instead of looking up `{ projectId, source_id }` in `source_records` and reading `redacted_content`.
  2. **Missing `Unknown` vs `Needs review` rules (PDF p. 5):** Currently when an excerpt doesn't match `source_text`, line 158 returns `NEEDS_REVIEW`, and `UNKNOWN` is only returned when `source_text` is empty. Per PDF p. 5: missing/unknown `source_id` or no valid supporting excerpt -> `Unknown` (routed to Gap Loop); partial match, single informal note, or missing task owner/deadline -> `Needs review`.
  3. **Conflict leakage across unrelated findings (`lines 102-110`):** `detect_conflict(facts)` returns `True` if *any* topic in `facts` conflicts, causing `validate_evidence` to mark unrelated findings as `CONFLICTING`.
  4. **Discards conflicting versions (`lines 46-90, 105-110`):** `detect_conflict` returns only a `bool`, losing both versions, their `source_id`s, timestamps, and source links required by PDF p. 3–5.
  5. **Naive vs. aware datetime crash (`lines 61-71`):** Comparing a date-only string (`"2026-11-09"`) with an ISO UTC timestamp (`"2026-11-10T14:00:00Z"` or `+00:00` from MongoDB) raises `TypeError: can't compare offset-naive and offset-aware datetimes`, which `except (ValueError, TypeError): continue` silently swallows—skipping supersession logic.
- **Fix:**
  - Implement DB-backed validation (`validate_finding_against_sources`) that looks up `(projectId, source_id)` in `source_records`.
  - Enforce deterministic rules for all 4 states (`Supported`, `Needs review`, `Conflicting`, `Unknown`), including documented partial-match rules, informal-note / missing-owner-or-deadline downgrades to `Needs review`, and topic-scoped temporal conflict comparison.
  - Return structured `conflict_details` (`earlier_version`, `newer_version`, timestamps, `source_id`s, links) rather than a bare `bool`.
  - Normalize all datetimes to UTC-aware before comparison.

---

### BL-07: Freshness monitor queries the wrong collection, wrong fields, and wrong logic
- **Locations:**
  - `services/ai-engine/app/services/freshness_monitor.py:5-89`
- **Issues:**
  1. PDF pages 3–6 require reading `created_at`, `updated_at`, and `imported_at` on `source_records` and comparing against **newer project activity** (newer commits, PRs, or records in the same project) to set a `Re-check Recommended` indicator (`recheck_recommended: bool`) alongside the status.
  2. Currently `scan_evidence_freshness` queries `self_reported_evidence.submitted_at < now - 90 days`, writes `"stale"`/`"current"`/`"invalid_date"` back to `self_reported_evidence`, and raises `ValueError` if given a MongoDB `datetime` object because `datetime.fromisoformat(recorded_at)` only accepts `str` (`line 10`).
- **Fix:** Replace/augment with `evaluate_finding_freshness(source_record, latest_project_activity_at, max_age_days=90)` accepting `datetime | str` normalized to UTC, comparing `source_record.updated_at` against `latest_project_activity_at` (and optional age threshold), and persisting `{ source_updated_at, recheck_recommended, reason }` into `findings.freshness`.

---

### BL-08: Module 3 (`gap_detector`) is missing and Module 4 (`gap_question_generator.py`) lacks LLM phrasing & DB persistence
- **Locations:**
  - `services/ai-engine/app/services/gap_question_generator.py:5-38`
- **Issues:**
  - PDF pages 3–5 specify deterministic `gap_detector` flagging 4 gap categories: **missing owners** (tasks without owners), **missing rationales** (decisions without reasoning), **unresolved information** (`Unknown` findings), and **conflicting sources** (`Conflicting` findings). None of those detectors exist.
  - `generate_gap_question` uses static `if/elif` templates instead of LLM-phrased questions grounded in the detected gap, generates questions for `NEEDS_REVIEW` (which PDF p. 5 and `gaps.controller.ts:15` route to the team leader rather than the outgoing member), and never writes to `gap_questions` in MongoDB (`projectId`, `relatedFindingId`, `question`, `status: "pending"`, `evidence_badge: "Self-reported"`).
- **Fix:**
  - Create `app/services/gap_detector.py` to deterministically produce typed `DetectedGap` items (`missing_owner`, `missing_rationale`, `unknown_claim`, `conflicting_sources`).
  - Update `gap_question_generator.py` to use the LLM strictly to phrase each `DetectedGap` into a focused question (with deterministic template fallback on LLM error) and insert `GapQuestion` documents into `gap_questions`.

---

## 4. Warnings

### WR-01: Unauthenticated, unscoped endpoints exposed on host port `8001` + mutating `GET` route
- **Locations:** `services/ai-engine/app/main.py:93-190`, `docker-compose.yaml:63-64`
- **Issue:** `/api/v1/evidence/self-reported` (`POST`/`GET`) and `/api/v1/evidence/freshness/scan` have no `projectId` filter, no RBAC/internal-token check, and are exposed directly on host port `8001`, bypassing the Node.js gateway. Additionally, `GET /api/v1/evidence/freshness/scan` (`main.py:93-109`) mutates MongoDB via `collection.update_one(...)` inside an HTTP `GET` handler.
- **Fix:** Remove client-facing `self_reported_evidence` CRUD (already handled through JWT-authenticated `services/backend/src/controllers/gaps.controller.ts`), change freshness scan to `POST`, scope all queries by `projectId`, and guard internal endpoints with a shared internal token header (or restrict exposure to the internal Docker network).

### WR-02: Negation detector has high false-positive and false-negative rates
- **Locations:** `services/ai-engine/app/services/evidence_validator.py:17-43,127-139`
- **Issue:** `contains_negation` omits common negations (`isn't`, `aren't`, `shouldn't`, `couldn't`, `wouldn't`, `rejected`, `deprecated`, `removed`, `cancelled`, `declined`), and checks whole-excerpt negation rather than claim-relevant polarity (e.g., source `"We did not use Redis; we chose MongoDB"` + claim `"The team chose MongoDB"` triggers `claim_is_negated != excerpt_is_negated` and falsely downgrades `Supported` to `Needs review`).
- **Fix:** Expand negation patterns (`\b\w+n't\b` and negative decision verbs) and evaluate negation within the clause matching the claim rather than across the entire excerpt.

### WR-03: Excerpt regex boundary check fails when excerpt starts/ends with punctuation or redaction tokens
- **Locations:** `services/ai-engine/app/services/evidence_validator.py:144-147`
- **Issue:** Wrapping `re.escape(normalized_excerpt)` with `(?<!\w)...(?!\w)` assumes the first and last characters of `normalized_excerpt` are word characters (`\w`). If an excerpt starts or ends with punctuation/brackets (e.g. `"[REDACTED_SECRET]"` or `"(JWT auth)."`), boundary assertion behavior flips.
- **Fix:** Apply `(?<!\w)` only if `normalized_excerpt[0].isalnum()` (or matches `\w`), and `(?!\w)` only if `normalized_excerpt[-1].isalnum()` (or matches `\w`).

### WR-04: Invalid / mismatched dependency `httpx2==2.16.0` and missing LLM SDK in `requirements.txt`
- **Locations:** `services/ai-engine/requirements.txt:18`
- **Issue:** `requirements.txt` pins `httpx2==2.16.0` instead of `httpx` (used in `services/analytics-service/requirements.txt:8`), and includes neither an LLM SDK (e.g., `openai`, matching `OPENAI_API_KEY` in `.env.example:40`) nor `pytest` / `mongomock`.
- **Fix:** Replace `httpx2==2.16.0` with `httpx`, add `openai` (or the chosen LLM client) plus `pytest` and `mongomock`, and verify `pip install -r requirements.txt` cleanly inside the Docker build.

---

## 5. Info / Code Quality & Testing Gaps

- **IN-01 (Empty scaffold packages):** `services/ai-engine/app/api/__init__.py` and `services/ai-engine/app/core/__init__.py` are empty. Settings/env loading should live in `app/core/config.py` and FastAPI routers (`/internal/*`, `/api/v1/*`) in `app/api/` rather than crowding `app/main.py`.
- **IN-02 (Missing test coverage & root test runner path):** `services/ai-engine/tests/` has no tests for `gap_question_generator.py`, `app/main.py` endpoints, or mixed naive/aware ISO timestamps in `detect_conflict`. Running `python -m unittest discover -s services/ai-engine/tests` from the repo root fails with `ModuleNotFoundError: No module named 'app'` unless `PYTHONPATH=services/ai-engine` (or `pytest` config with `pythonpath`) is set.
- **IN-03 (N+1 writes in freshness scan):** `freshness_monitor.py:65-74` issues one `update_one` call per document instead of `bulk_write`.

---

## 6. Recommended Revival Execution Order

1. **Runtime, Env & DB Bridge:** Fix `DATABASE_NAME="sanchaya"`, root `.env` loading + `docker-compose.yaml` env vars, lazy DB initialization, `services/ai-engine/main.py` / `Dockerfile`, and `requirements.txt` (`httpx`, `openai`, `pytest`, `mongomock`).
2. **Canonical Schemas:** Align `EvidenceStatus` to `"Supported" | "Needs review" | "Conflicting" | "Unknown"` and define Pydantic v2 models matching `source_records`, `findings`, and `gap_questions`.
3. **Stage 2 (`ai_extractor.py`):** Implement structured LLM JSON extraction from `source_records.redacted_content` with strict Pydantic validation.
4. **Stage 3 (`evidence_validator.py` & `freshness_monitor.py`):** Query `source_records` by `(projectId, source_id)`, implement partial-match / informal-note / missing-owner-or-deadline rules, return structured topic-scoped conflict versions, and compute `recheck_recommended` from `created_at`/`updated_at`/`imported_at` vs. newer project activity.
5. **Stage 3–4 (`gap_detector.py` & `gap_question_generator.py`):** Deterministically detect all 4 gap categories, use the LLM strictly for phrasing (with fallback), and persist `pending` `GapQuestion` documents with `evidence_badge: "Self-reported"`.
6. **Gateway Wiring & Tests:** Expose `POST /internal/extract-and-verify` matching `PythonBridge.triggerExtractionAndVerify` and add `TestClient` + `mongomock` end-to-end tests.

