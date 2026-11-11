# Sanchaya Architecture Decision Records (ADRs)

---

# ADR-0001: Polyglot Microservice Architecture & Deterministic Verification

* **Status:** Accepted
* **Date:** 2026-11-09
* **Deciders:** Lokesh Pravin Pawar, Ayush Nirmal, Varad Gaikwad, Prakhar Raj (Team Epsilum)

---

## 1. Context and Problem Statement
When a developer leaves a software project, technical context is fragmented across GitHub activity, meeting notes, and task trackers. Generic AI summarizers fail in project handovers because they hallucinate architectural rationale, omit source links, ignore outdated evidence, and risk leaking credentials embedded in commits or notes. Simultaneously, our four-member engineering team brings specialized strengths across React, Node.js/TypeScript, and Python data/AI ecosystems.

## 2. Decision Drivers
* **Zero Hallucination Tolerance:** Every claim in a handover must be deterministically verified against an existing source record and exact excerpt substring.
* **Pre-AI Security:** Credentials and PII must be stripped deterministically before reaching external LLM APIs.
* **Team Velocity & Type Safety:** Leverage Node.js + TypeScript for high-concurrency I/O, multipart ingestion, and strict RBAC API routing, while leveraging Python for LLM structured extraction, Git history analytics, and ReportLab PDF generation.

## 3. Considered Options
1. **Monolithic Python Backend (FastAPI only)**
2. **Monolithic Node.js Backend (Express/TypeScript only)**
3. **Polyglot Microservice Architecture (`backend` in Node.js/TS + `ai-engine` & `analytics-service` in Python/FastAPI) sharing MongoDB**

## 4. Decision Outcome
Chosen option: **Option 3 — Polyglot Microservice Architecture with Deterministic Verification Gates**, orchestrated via Docker Compose.

### Positive Consequences
* Clear service boundaries aligned with team ownership: Frontend (`services/frontend`), Gateway/Ingestion/Security (`services/backend`), AI/Verification (`services/ai-engine`), and Risk/Readiness/PDF (`services/analytics-service`).
* TypeScript + Zod at the API Gateway enforces strict compile-time and runtime schemas on all incoming sources (`SRC-GH-*`, `SRC-DOC-*`, `SRC-TSK-*`) and JWT role claims.
* Python services gain native access to Pydantic structured LLM outputs, Git analytics, and `ReportLab` PDF rendering.

### Negative Consequences / Trade-offs
* Requires managing inter-service HTTP calls (`pythonBridge.ts`) and shared MongoDB schema consistency across TypeScript and Python.
* Mitigated by containerizing all services in the root `docker-compose.yml` over a unified bridge network (`sanchaya-network`).

---

# ADR-0002: Deterministic Regex Pre-AI Secret and PII Masking

* **Status:** Accepted
* **Date:** 2026-11-09
* **Deciders:** Ayush Nirmal, Varad Gaikwad, Lokesh Pravin Pawar, Prakhar Raj (Team Epsilum)

---

## 1. Context and Problem Statement
Software repositories, meeting minutes, and task exports frequently contain live cloud credentials (AWS keys, Stripe secrets, OpenAI keys), GitHub personal access tokens, database URIs, private keys, and personal contact info. Relying on an LLM to identify and redact its own prompt inputs is fundamentally flawed because the raw secrets must already be sent across external networks to the AI provider.

## 2. Decision Drivers
* **Absolute Data Privacy:** Guarantee zero credential exposure to LLM providers or unredacted persistence in MongoDB.
* **Predictable & Auditable Performance:** Deterministic pattern matching with recorded redaction counts per ingested item.
* **Stage 1 Architectural Invariant:** Non-bypassable security perimeter before any downstream processing.

## 3. Considered Options
1. **LLM-Based In-Context Redaction:** Asking the AI to redact secrets as part of extraction. (Rejected: Leaks raw secrets to AI provider).
2. **Asynchronous Background Redaction:** Saving raw documents and scanning asynchronously. (Rejected: Leaves a window where raw secrets reside in MongoDB).
3. **Synchronous Deterministic Pre-AI Regex Pipeline (`secretScanner.ts`):** Mandatory filter executing synchronously upon multipart/connector ingestion before MongoDB write.

## 4. Decision Outcome
Chosen option: **Option 3 — Synchronous Deterministic Regex Pipeline**.

### Positive Consequences
* All raw content is stripped of cloud keys, GitHub tokens, `.env` assignments, private keys (`[REDACTED_SECRET]`), and emails/phones/IPs (`[REDACTED_PII]`) prior to MongoDB insertion.
* Metric 5 automated security tests can benchmark 100% redaction efficacy against synthetic fixtures.
* `redactionCount` is tracked in source metadata without logging sensitive values to stdout.

### Negative Consequences / Trade-offs
* Regex patterns must be actively maintained as cloud providers release new token formats.

---

# ADR-0003: Four-State Deterministic Evidence Verification Logic

* **Status:** Accepted
* **Date:** 2026-11-09
* **Deciders:** Varad Gaikwad, Ayush Nirmal, Prakhar Raj, Lokesh Pravin Pawar (Team Epsilum)

---

## 1. Context and Problem Statement
AI summarizers often hallucinate claims or attribute statements to sources that do not contain them. In a technical handover, unverified claims cause costly misdirection for onboarding engineers.

## 2. Decision Drivers
* **Zero Trust in AI Attribution:** AI extracts candidate claims and cites sources, but the verification verdict must be deterministic.
* **Handling Uncertainty & Contradictions:** Explicitly distinguish between supported facts, ambiguous notes, temporal code contradictions, and missing context.

## 3. Decision Outcome
Chosen option: **Deterministic 4-State Verification Machine** implemented in backend code:

1. **`Supported`:** Verified only if `source_id` exists in MongoDB `source_records` AND `verbatim_excerpt` is an exact, case-normalized substring of `source_record.redacted_content`.
2. **`Needs review`:** The excerpt is an informal single note or a task missing an owner/deadline.
3. **`Conflicting`:** A newer commit/PR (`updated_at`) postdates and contradicts an earlier meeting decision.
4. **`Unknown`:** No matching source excerpt exists in database; automatically routed to the Gap-to-Question Loop.

### Positive Consequences
* Eradicates hallucinations from final handovers.
* Outgoing members are only prompted for true gaps rather than filling out tedious generic forms.
* Responses to gap questions are permanently tagged as `Self-reported`.

---

# ADR-0004: Contribution Concentration Metric & 7-Point Handover Readiness Engine

* **Status:** Accepted
* **Date:** 2026-11-09
* **Deciders:** Prakhar Raj, Ayush Nirmal, Lokesh Pravin Pawar, Varad Gaikwad (Team Epsilum)

---

## 1. Context and Problem Statement
Determining whether a project is ready for handover has historically been subjective. Furthermore, understanding which modules represent knowledge silos (bus-factor risks) requires objective Git analysis rather than developer memory.

## 2. Decision Drivers
* **Objective Bus-Factor Analysis:** Quantify contributor concentration per module from commit frequency and task ownership.
* **Transparent Quality Gate:** Ensure handovers are never prematurely released to incoming members before all verification criteria are satisfied.

## 3. Decision Outcome
Chosen option: **Deterministic Contribution Concentration Analyzer** paired with a **7-Point Readiness Checklist**:

1. **Contribution Concentration Analyzer:** Evaluates Git commit histories and task ownership across modules. Modules where a single contributor authored >70% of code are assigned a `High` risk tier.
2. **7-Point Handover Readiness Checklist:** Evaluates:
   - `sourcesVerified`: Ingested sources exist and are verified.
   - `decisionsBackedByEvidence`: Decisions backed by supported excerpts.
   - `unfinishedTasksAssignedOrUnknown`: Tasks have owners or are flagged.
   - `blockersIdentified`: Critical path blockers disclosed.
   - `conflictsDisclosed`: Temporal code-vs-doc conflicts flagged.
   - `recipientPermissionsChecked`: Incoming member permissions validated.
   - `leaderApprovalRecorded`: Formal team leader sign-off.
3. **Status Transitions:** Evaluates through `Needs Attention` -> `Ready for Review` -> `Approved for Sharing`. Incoming members are strictly blocked (`403 Forbidden`) from viewing or exporting handovers until status reaches `Approved for Sharing`.

### Positive Consequences
* Provides actionable risk hotspots for incoming contributors.
* Strict role isolation prevents onboarding developers from reading incomplete or unverified draft state.
