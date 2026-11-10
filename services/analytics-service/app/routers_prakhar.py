"""FastAPI router for Prakhar's modules. Include in the main app:
    from app.routers_prakhar import router as analytics_router
    app.include_router(analytics_router)
Auth: reads X-Role and X-User-Id headers as a stand-in until Ayush's JWT middleware
is wired in (replace `identity()` with the JWT dependency)."""
import os
import tempfile

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.handover import assembly
from app.pdf.pdf_generator import generate_pdf
from app.readiness.engine import evaluate
from app.store import STORE

router = APIRouter(prefix="/projects", tags=["risk-readiness-handover"])


ROLE_ALIASES = {
    "leader": "leader", "team_leader": "leader", "team leader": "leader", "teamleader": "leader", "lead": "leader",
    "incoming": "incoming", "incoming_member": "incoming", "incoming member": "incoming",
    "outgoing": "outgoing", "outgoing_member": "outgoing", "outgoing member": "outgoing",
}


def identity(x_role, x_user_id):
    """The Node gateway verifies the JWT, then forwards X-Role and X-User-Id."""
    if not x_role:
        raise HTTPException(401, "Missing X-Role header")
    r = x_role.strip().lower()
    return ROLE_ALIASES.get(r, ROLE_ALIASES.get(r.replace("-", "_"), r)), x_user_id


def _project(pid):
    try:
        return STORE.get(pid)
    except KeyError:
        raise HTTPException(404, f"Project '{pid}' not found")


def _require_leader(role):
    if role != "leader":
        raise HTTPException(403, "Team leader role required")


class SignOff(BaseModel):
    kind: str   # finding | task
    id: str
    note: str | None = None
    resolve: bool = False
    owner_unknown: bool = False


@router.post("/{pid}/demo")
def load_demo(pid: str):
    from data.synthetic.generate import demo_project
    STORE.put(pid, demo_project(pid))
    return {"loaded": pid}


@router.put("/{pid}/data")
def put_data(pid: str, body: dict, x_role: str = Header(None), x_user_id: str = Header(None)):
    role, _ = identity(x_role, x_user_id); _require_leader(role)
    body = {**body, "project_id": pid}
    body.setdefault("approval", None); body.setdefault("versions", []); body.setdefault("receipts", [])
    STORE.put(pid, body)
    return {"stored": pid}


@router.post("/{pid}/signoff")
def signoff(pid: str, s: SignOff, x_role: str = Header(None), x_user_id: str = Header(None)):
    role, _ = identity(x_role, x_user_id); _require_leader(role)
    p = _project(pid)
    pool = p["findings"] if s.kind == "finding" else p["tasks"]
    item = next((x for x in pool if x["id"] == s.id), None)
    if item is None:
        raise HTTPException(404, f"{s.kind} {s.id} not found")
    item["reviewer_signoff"] = True
    item["reviewer_note"] = s.note
    if s.resolve:
        item["resolved"] = True
    if s.owner_unknown:
        item["owner_unknown"] = True
    STORE.put(pid, p)
    return evaluate(p)


@router.get("/{pid}/risk-map")
def get_risk_map(pid: str, x_role: str = Header(None), x_user_id: str = Header(None)):
    role, _ = identity(x_role, x_user_id); _require_leader(role)
    return assembly.risk_map(_project(pid))


@router.post("/{pid}/readiness/evaluate")
def readiness(pid: str, x_role: str = Header(None), x_user_id: str = Header(None)):
    role, _ = identity(x_role, x_user_id); _require_leader(role)
    return evaluate(_project(pid))


@router.post("/{pid}/handover/approve")
def approve(pid: str, x_role: str = Header(None), x_user_id: str = Header(None)):
    role, uid = identity(x_role, x_user_id)
    p = _project(pid)
    try:
        v = assembly.approve(p, uid or "leader", role)
    except assembly.AccessDenied as e:
        raise HTTPException(403, str(e))
    except assembly.NotReady as e:
        raise HTTPException(409, {"message": str(e), "readiness": e.readiness})
    STORE.put(pid, p)
    return {k: v[k] for k in ("version", "created_at", "snapshot_hash", "content_hash")}


@router.get("/{pid}/handover")
def handover(pid: str, x_role: str = Header(None), x_user_id: str = Header(None)):
    role, uid = identity(x_role, x_user_id)
    try:
        return assembly.get_handover(_project(pid), role, uid)
    except assembly.AccessDenied as e:
        raise HTTPException(403, str(e))


@router.get("/{pid}/handover/versions")
def versions(pid: str, x_role: str = Header(None), x_user_id: str = Header(None)):
    role, _ = identity(x_role, x_user_id); _require_leader(role)
    p = _project(pid)
    return {"versions": assembly.list_versions(p), "receipts": p.get("receipts", [])}


@router.post("/{pid}/handover/versions/{v}/receipt")
def receipt(pid: str, v: int, x_role: str = Header(None), x_user_id: str = Header(None)):
    role, uid = identity(x_role, x_user_id)
    if role != "incoming":
        raise HTTPException(403, "Incoming member role required")
    p = _project(pid)
    try:
        r = assembly.acknowledge(p, v, uid)
    except assembly.AccessDenied as e:
        raise HTTPException(403, str(e))
    except KeyError as e:
        raise HTTPException(404, str(e))
    STORE.put(pid, p)
    return r


@router.get("/{pid}/handover/versions/{v}/pdf")
def pdf(pid: str, v: int, x_role: str = Header(None), x_user_id: str = Header(None)):
    role, uid = identity(x_role, x_user_id)
    p = _project(pid)
    if role == "incoming" and uid != (p.get("recipient") or {}).get("user_id"):
        raise HTTPException(403, "This handover was not assigned to you")
    if role not in ("leader", "incoming"):
        raise HTTPException(403, "Your role does not have access to the handover")
    ver = next((x for x in p.get("versions", []) if x["version"] == v), None)
    if ver is None:
        raise HTTPException(404, f"Version {v} does not exist")
    if role == "incoming" and evaluate(p)["state"] != "Approved for Sharing":
        raise HTTPException(403, "Handover is not approved for sharing")
    out = os.path.join(tempfile.gettempdir(), f"handover_{pid}_v{v}.pdf")
    generate_pdf(ver, out)
    return FileResponse(out, media_type="application/pdf", filename=f"handover_v{v}.pdf")
