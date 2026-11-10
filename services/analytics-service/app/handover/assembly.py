"""Handover assembly, role filtering, immutable versions and receipts.

Rules enforced here (not in the UI):
 - incoming member gets content ONLY when readiness state == Approved for Sharing
 - unapproved findings are removed from the data before it is returned
 - every approval creates an immutable, numbered, SHA-256-hashed version
 - changing any included finding after approval invalidates the approval
"""
import copy

from app.analytics.risk_analyzer import analyze
from app.common import now_iso, sha256
from app.readiness.engine import APPROVED, evaluate, snapshot_hash


class AccessDenied(Exception):
    pass


class NotReady(Exception):
    def __init__(self, message, readiness):
        super().__init__(message)
        self.readiness = readiness


def _eligible(f):
    return f.get("status") == "Supported" or bool(f.get("reviewer_signoff"))


def _item(f):
    return {"id": f["id"], "text": f["text"], "status": f["status"], "source_id": f.get("source_id"),
            "excerpt": f.get("excerpt"), "freshness": f.get("freshness", "unknown"),
            "reviewer_signoff": bool(f.get("reviewer_signoff"))}


def risk_map(project: dict) -> dict:
    return analyze(project.get("commits", []), project.get("tasks", []),
                   project.get("departing_member"), project.get("alias_map"))


def build_content(project: dict, rmap: dict = None, eligible_only: bool = True) -> dict:
    rmap = rmap or risk_map(project)
    findings = project.get("findings", [])
    pick = (lambda f: _eligible(f)) if eligible_only else (lambda f: True)
    decisions = [_item(f) for f in findings if f["category"] == "decision" and f["status"] not in ("Conflicting", "Unknown") and pick(f)]
    deps = [_item(f) for f in findings if f["category"] == "dependency" and pick(f)]
    blockers = [_item(f) for f in findings if f["category"] == "blocker" and pick(f)]
    gaps = [dict(_item(f), resolved=bool(f.get("resolved")), conflicts_with=f.get("conflicts_with"))
            for f in findings if f["status"] in ("Conflicting", "Unknown")]
    tasks = []
    for t in project.get("tasks", []):
        if t.get("status") in ("open", "blocked"):
            tasks.append({"id": t["id"], "title": t["title"], "status": t["status"],
                          "owner": t.get("assignee") or "Owner unknown (reviewer-confirmed)",
                          "blocker": t.get("blocker") or ("No blocker recorded (reviewer sign-off)" if t["status"] == "blocked" else None)})
    risks = [{"unit": u["unit"], "level": u["level"], "top_contributor": u["top_contributor"],
              "top_commit_share": u["top_commit_share"], "total_changes": u["total_changes"],
              "wording": u["wording"], "notes": u["notes"]}
             for u in rmap["units"] if u["level"] in ("High", "Medium")]

    # prioritised, rule-based next actions
    actions, n = [], 1
    for t in tasks:
        if t["status"] == "blocked":
            actions.append({"priority": n, "action": f"Unblock {t['id']} ({t['title']})", "why": t["blocker"]}); n += 1
    for tid in rmap["task_risk"]["departing_member_open_tasks"]:
        title = next((t["title"] for t in tasks if t["id"] == tid), tid)
        if not any(a["action"].startswith(f"Unblock {tid}") for a in actions):
            actions.append({"priority": n, "action": f"Take over {tid} ({title})", "why": "Was assigned to the departing member"}); n += 1
    for t in tasks:
        if t["owner"].startswith("Owner unknown"):
            actions.append({"priority": n, "action": f"Assign an owner to {t['id']} ({t['title']})", "why": "No owner"}); n += 1
    for r in risks:
        if r["level"] == "High":
            actions.append({"priority": n, "action": f"Pair on {r['unit']} with {r['top_contributor']} / second contributor",
                            "why": f"{r['top_commit_share']:.0%} of changes by one person"}); n += 1
    for g in gaps:
        if not g["resolved"]:
            actions.append({"priority": n, "action": f"Resolve {g['id']}: {g['text']}", "why": g["status"]}); n += 1

    return {
        "project": project.get("name"),
        "departing_member": project.get("departing_member"),
        "recipient": (project.get("recipient") or {}).get("name"),
        "summary": {"decisions": len(decisions), "open_tasks": len(tasks), "dependencies": len(deps),
                    "known_problems": len(blockers), "risk_areas": len(risks), "open_gaps": sum(1 for g in gaps if not g["resolved"])},
        "decisions": decisions, "tasks": tasks, "dependencies": deps, "known_problems": blockers,
        "risk_areas": risks, "open_gaps": gaps, "next_actions": actions,
        "risk_disclaimer": rmap["disclaimer"],
    }


def approve(project: dict, approver_id: str, approver_role: str, now=None) -> dict:
    """Leader approval -> immutable version. Mutates project (approval, versions)."""
    if approver_role != "leader":
        raise AccessDenied("Only a team leader can approve a handover")
    ready = evaluate(project)
    if any(not r["passed"] for r in ready["rules"][:6]):
        raise NotReady("Rules 1 to 6 must pass before approval", ready)
    project["approval"] = {"approved_by": approver_id, "approved_by_role": approver_role,
                           "approved_at": now_iso(now), "snapshot_hash": snapshot_hash(project)}
    final = evaluate(project)
    assert final["state"] == APPROVED
    rmap = risk_map(project)
    content = build_content(project, rmap, eligible_only=True)
    version = {
        "version": len(project.setdefault("versions", [])) + 1,
        "created_at": project["approval"]["approved_at"],
        "approved_by": approver_id,
        "snapshot_hash": project["approval"]["snapshot_hash"],
        "content_hash": sha256(content),
        "readiness": copy.deepcopy(final),
        "content": content,
        "risk_map": copy.deepcopy(rmap),
    }
    project["versions"].append(copy.deepcopy(version))
    return version


def get_handover(project: dict, role: str, user_id: str = None) -> dict:
    ready = evaluate(project)
    if role == "leader":
        content = build_content(project, eligible_only=False)
        return {"preview": ready["state"] != APPROVED, "readiness_state": ready["state"],
                "failing_rules": ready["failing_rules"], "content": content}
    if role == "incoming":
        if user_id != (project.get("recipient") or {}).get("user_id"):
            raise AccessDenied("This handover was not assigned to you")
        if ready["state"] != APPROVED or not project.get("versions"):
            raise AccessDenied("The handover is not approved for sharing yet")
        v = project["versions"][-1]
        if v["snapshot_hash"] != ready["snapshot_hash"]:
            raise AccessDenied("Content changed after the last approval; waiting for re-approval")
        return {"preview": False, "readiness_state": ready["state"], "version": v["version"],
                "content_hash": v["content_hash"], "content": copy.deepcopy(v["content"])}
    raise AccessDenied("Your role does not have access to the handover")


def list_versions(project: dict) -> list:
    return [{k: v[k] for k in ("version", "created_at", "approved_by", "snapshot_hash", "content_hash")}
            for v in project.get("versions", [])]


def acknowledge(project: dict, version: int, user_id: str, now=None) -> dict:
    if user_id != (project.get("recipient") or {}).get("user_id"):
        raise AccessDenied("Only the assigned incoming member can acknowledge receipt")
    v = next((x for x in project.get("versions", []) if x["version"] == version), None)
    if v is None:
        raise KeyError(f"Version {version} does not exist")
    receipt = {"version": version, "user_id": user_id, "acknowledged_at": now_iso(now), "content_hash": v["content_hash"]}
    project.setdefault("receipts", []).append(receipt)
    return receipt
