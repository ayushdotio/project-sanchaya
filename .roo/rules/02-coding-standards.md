# 02 — Coding Standards & Git Conventions (`.roo/rules/02-coding-standards.md`)

## 1. Node.js & TypeScript Standards (`services/backend/`)

### 1.1 Compiler & Module Resolution (`tsconfig.json`)
* Target `es2022` with `"module": "nodenext"` and `"moduleResolution": "nodenext"`.
* **Relative Import Rule:** Always include the `.js` file extension in local relative TypeScript imports (e.g., `import { User } from '../models/User.js';`), as required by NodeNext ESM resolution.
* Maintain `"strict": true`, `"noUncheckedIndexedAccess": true`, and `"types": ["node"]`.
* Do **not** enable `"jsx"`, `"exactOptionalPropertyTypes"`, or `"verbatimModuleSyntax"` in the backend service.
* Never use explicit `any`; define interfaces in `src/types/*.types.ts` or infer types from Zod schemas (`z.infer<typeof Schema>`).

### 1.2 Runtime Validation & Error Handling
* Validate all incoming `req.body`, `req.query`, `req.params`, and `process.env` variables using **Zod** (`safeParse`).
* Return standardized JSON envelopes across all controllers:
  * **Success:** `{ "success": true, "message": "...", "data": { ... } }`
  * **Validation Error (`400`):** `{ "success": false, "error": "Validation failed", "errors": parseResult.error.flatten().fieldErrors }`
  * **Auth/Gate Error (`401`/`403`/`404`/`409`):** `{ "success": false, "error": "Descriptive message" }`

## 2. Python & FastAPI Standards (`services/ai-engine/`, `services/analytics-service/`)
* Target **Python 3.11+** with **FastAPI** and **Pydantic v2** (`BaseModel`, `Field`).
* Enforce strict type hints on all function signatures and return types.
* Preserve exact `snake_case` field names (`source_id`, `created_at`, `updated_at`, `imported_at`, `redacted_content`, `verbatim_excerpt`, `verification_status`) across MongoDB documents and JSON payloads.
* Wrap all external LLM calls in structured Pydantic validation blocks with deterministic fallback handling if the model returns malformed JSON.

## 3. React & Tailwind Standards (`services/frontend/`)
* Use functional React 18 components with TypeScript/ES modules and Tailwind CSS utility classes.
* Every claim card in the UI must support expanding its `source_id`, `verbatim_excerpt`, and freshness timestamp.
* Always display both a text label and a color badge for the 4 verification states (`Supported`, `Needs review`, `Conflicting`, `Unknown`) and explicitly badge outgoing member responses as `Self-reported`.

## 4. Environment & Docker Networking Rules
* Use a **single root `.env` file** at the repository root (populated from `.env.example`). Do not create scattered `.env` files inside nested service directories for Docker runs.
* **MongoDB URI Selection:**
  * Inside Docker Compose (`mongo` container): `mongodb://mongo:27017/sanchaya`
  * Inside Docker Compose reaching Host OS MongoDB: `mongodb://host.docker.internal:27017/sanchaya`
  * Running directly on Host OS (`npm run dev`): `mongodb://127.0.0.1:27017/sanchaya`
  * **Never** use `mongodb://localhost:27017/sanchaya` inside a Docker container.

## 5. Four-Tier Git Workflow
* **Branch Hierarchy:** `main` (Tier 1) <- `develop` (Tier 2) <- `frontend | backend | ai-engine | analytics` (Tier 3) <- `<domain>/<task-name>` (Tier 4).
* Never commit or open a PR directly to `main`.
* Always pull updates from `origin/develop` before creating a Tier 4 task branch and before pushing your Tier 3 domain branch.
* Use atomic **Conventional Commits**: `feat(backend): ...`, `fix(ai-engine): ...`, `security(backend): ...`, `docs(api): ...`, `test(backend): ...`.