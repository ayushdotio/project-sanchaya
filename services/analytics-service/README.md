# Sanchaya Analytics & PDF Service (`services/analytics-service`)
Owner: Prakhar Raj. Python 3.11 + FastAPI + ReportLab. Port **8002**. Branch: `analytics`.
Deterministic logic only (no AI): contribution-risk map, 7-rule readiness checklist, role-filtered handover with
immutable versions and receipts, and the evidence-linked PDF.

## Files
| Path | Purpose |
|---|---|
| `main.py` | Entry point the repo's Dockerfile runs (`uvicorn main:app`) |
| `app/main.py` | FastAPI app, `/health` |
| `app/routers_prakhar.py` | All endpoints (below) |
| `app/analytics/risk_analyzer.py` | Contribution Concentration Risk Map |
| `app/readiness/engine.py` | 7-rule checklist, 3 states, SHA-256 snapshot hash |
| `app/handover/assembly.py` | Assembly, role filtering, approval, versions, receipts |
| `app/pdf/pdf_generator.py` | ReportLab PDF |
| `app/store.py` | Storage: `MONGO_URI` set -> MongoDB, else file (`SANCHAYA_STORE`), else memory |
| `data/synthetic/generate.py` | Fake project with planted problems + answer key |
| `tests/` | 37 pytest tests |
| `run_demo.py` | Prints the whole flow, writes `out/handover_v1.pdf` |

## Run locally (no Docker)
```bash
cd services/analytics-service
python -m venv venv && venv\Scripts\activate          # Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
python -m pytest tests -q
python run_demo.py
uvicorn main:app --reload --port 8002                 # http://localhost:8002/docs  and  /health
```

## Run in Docker (repo root)
```bash
docker compose up --build analytics-service
curl http://localhost:8002/health        # {"status":"healthy","service":"sanchaya-analytics-service","store":"memory|mongo"}
```
For persistence in MongoDB, `analytics-service` in `docker-compose.yaml` needs:
```yaml
    environment:
      - MONGO_URI=${MONGO_URI}
    depends_on:
      - mongo
```
Without `MONGO_URI` the service still works but keeps data in memory (lost on restart).

## How the Node gateway calls this service
The gateway verifies the user's JWT, then forwards the identity as headers:
`X-Role` (leader | incoming | outgoing; "Team Leader", "incoming_member" etc. are also accepted) and `X-User-Id`.
Base URL inside Docker: `process.env.PRAKHAR_ANALYTICS_SERVICE_URL` (= `http://analytics-service:8002`).
```ts
const r = await axios.get(`${process.env.PRAKHAR_ANALYTICS_SERVICE_URL}/projects/${id}/risk-map`,
  { headers: { "X-Role": user.role, "X-User-Id": user.id } });
```
| Method | Path | Role |
|---|---|---|
| PUT | `/projects/{id}/data` | leader: push commits, tasks, sources, findings, recipient |
| POST | `/projects/{id}/signoff` | leader: sign off / resolve a finding or task |
| GET | `/projects/{id}/risk-map` | leader |
| POST | `/projects/{id}/readiness/evaluate` | leader |
| POST | `/projects/{id}/handover/approve` | leader (409 + reasons if rules 1-6 fail) |
| GET | `/projects/{id}/handover` | leader (preview) / incoming (approved only) |
| GET | `/projects/{id}/handover/versions` | leader |
| POST | `/projects/{id}/handover/versions/{v}/receipt` | incoming |
| GET | `/projects/{id}/handover/versions/{v}/pdf` | leader / incoming |
| POST | `/projects/{id}/demo` | loads the synthetic project (development only) |

## Data shapes the gateway must send in `PUT /projects/{id}/data`
- commit: `{sha, author, email, timestamp, files:[{path, additions, deletions}]}` (GitHub *get a commit* returns `files[].filename`, `additions`, `deletions`: map `filename` -> `path`)
- task: `{id, title, assignee, status: open|blocked|done, blocker}`
- source: `{source_id, type, timestamp, scan_completed}`
- finding: `{id, category: decision|dependency|blocker|task, text, status: Supported|Needs review|Conflicting|Unknown, source_id, excerpt, freshness, reviewer_signoff, resolved}`
- recipient: `{user_id, name, role: "incoming", scope:[...]}`
- also: `project_id` is taken from the URL; optional `name`, `departing_member`, `alias_map`.

Risk wording is always "potential knowledge-risk area". Thresholds (70% / 50% / 90 days / 5 changes) are in `DEFAULTS` in `risk_analyzer.py`.
