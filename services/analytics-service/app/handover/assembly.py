"""Handover assembly, role filtering, immutable versions and receipts.

Rules enforced here (not in the UI):
 - incoming member gets content ONLY when readiness state == Approved for Sharing
 - unapproved findings are removed from the data before it is returned
 - recipient.scope filters sections returned to incoming members
 - every approval creates an immutable, numbered, SHA-256-hashed version
 - changing any included finding after approval invalidates the approval
"""

from __future__ import annotations

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
    status = f.get("status") or f.get("verification_status")
    signoff = bool(f.get("reviewer_signoff") or f.get("review_status") == "approved")
    return status == "Supported" or signoff


def _format_freshness(raw_freshness) -> str:
    if isinstance(raw_freshness, dict):
        if raw_freshness.get("recheck_recommended"):
            reason = raw_freshness.get("reason")
            return f"Re-check recommended ({reason})" if reason else "Re-check recommended"
        if raw_freshness.get("source_updated_at"):
            return "Current"
        return "unknown"
    return str(raw_freshness or "unknown")


def _item(f):
    status = f.get("status") or f.get("verification_status") or "Unknown"
    signoff = bool(f.get("reviewer_signoff") or f.get("review_status") == "approved")
    return {
        "id": str(f.get("id") or f.get("_id") or ""),
        "text": f.get("text") or f.get("claim") or "",
        "status": status,
        "source_id": f.get("source_id"),
        "excerpt": f.get("excerpt") or f.get("verbatim_excerpt") or "",
        "freshness": _format_freshness(f.get("freshness")),
        "reviewer_signoff": signoff,
        "evidence_origin": f.get("evidence_origin", "system"),
    }


def risk_map(project: dict) -> dict:
    return analyze(
        project.get("commits", []),
        project.get("tasks", []),
        project.get("departing_member"),
        project.get("alias_map"),
    )


def build_content(project: dict, rmap: dict | None = None, eligible_only: bool = True) -> dict:
    rmap = rmap or risk_map(project)
    findings = project.get("findings", [])
    pick = (lambda f: _eligible(f)) if eligible_only else (lambda f: True)

    def _status(f):
        return f.get("status") or f.get("verification_status")

    def _resolved(f):
        return bool(f.get("resolved") or (f.get("evidence_origin") == "self_reported" and _status(f) == "Supported"))

    decisions = [
        _item(f)
        for f in findings
        if f.get("category") == "decision" and _status(f) not in ("Conflicting", "Unknown") and pick(f)
    ]
    deps = [_item(f) for f in findings if f.get("category") == "dependency" and pick(f)]
    blockers = [_item(f) for f in findings if f.get("category") == "blocker" and pick(f)]
    gaps = [
        dict(
            _item(f),
            resolved=_resolved(f),
            conflicts_with=f.get("conflicts_with") or f.get("conflicting_source_id"),
        )
        for f in findings
        if _status(f) in ("Conflicting", "Unknown")
    ]

    tasks = []
    for t in project.get("tasks", []):
        if t.get("status") in ("open", "blocked"):
            tasks.append(
                {
                    "id": t["id"],
                    "title": t["title"],
                    "status": t["status"],
                    "owner": t.get("assignee") or "Owner unknown (reviewer-confirmed)",
                    "blocker": t.get("blocker")
                    or ("No blocker recorded (reviewer sign-off)" if t["status"] == "blocked" else None),
                }
            )

    risks = [
        {
            "unit": u["unit"],
            "level": u["level"],
            "top_contributor": u["top_contributor"],
            "top_commit_share": u["top_commit_share"],
            "total_changes": u["total_changes"],
            "wording": u["wording"],
            "notes": u["notes"],
        }
        for u in rmap["units"]
        if u["level"] in ("High", "Medium")
    ]
    hotspot_files = [
        {
            "file": h["file"],
            "level": h["level"],
            "top_contributor": h["top_contributor"],
            "top_commit_share": h["top_commit_share"],
            "total_changes": h["total_changes"],
        }
        for h in rmap.get("hotspot_files", [])
    ]
    gap_answers = [
        {
            "question": g.get("question", ""),
            "answer": g.get("answer", ""),
            "evidence_badge": g.get("evidence_badge", "Self-reported"),
            "answered_at": str(g.get("answered_at") or g.get("answeredAt") or ""),
        }
        for g in project.get("gap_answers", [])
        if g.get("answer")
    ]

    # prioritised, rule-based next actions
    actions, n = [], 1
    for t in tasks:
        if t["status"] == "blocked":
            actions.append({"priority": n, "action": f"Unblock {t['id']} ({t['title']})", "why": t["blocker"]})
            n += 1
    for tid in rmap["task_risk"]["departing_member_open_tasks"]:
        title = next((t["title"] for t in tasks if t["id"] == tid), tid)
        if not any(a["action"].startswith(f"Unblock {tid}") for a in actions):
            actions.append(
                {"priority": n, "action": f"Take over {tid} ({title})", "why": "Was assigned to the departing member"}
            )
            n += 1
    for t in tasks:
        if t["owner"].startswith("Owner unknown"):
            actions.append({"priority": n, "action": f"Assign an owner to {t['id']} ({t['title']})", "why": "No owner"})
            n += 1
    for r in risks:
        if r["level"] == "High":
            actions.append(
                {
                    "priority": n,
                    "action": f"Pair on {r['unit']} with {r['top_contributor']} / second contributor",
                    "why": f"{r['top_commit_share']:.0%} of changes by one person",
                }
            )
            n += 1
    for g in gaps:
        if not g["resolved"]:
            actions.append({"priority": n, "action": f"Resolve {g['id']}: {g['text']}", "why": g["status"]})
            n += 1

    return {
        "project": project.get("name"),
        "departing_member": project.get("departing_member"),
        "recipient": (project.get("recipient") or {}).get("name"),
        "summary": {
            "decisions": len(decisions),
            "open_tasks": len(tasks),
            "dependencies": len(deps),
            "known_problems": len(blockers),
            "risk_areas": len(risks),
            "open_gaps": sum(1 for g in gaps if not g["resolved"]),
            "gap_answers": len(gap_answers),
        },
        "decisions": decisions,
        "tasks": tasks,
        "dependencies": deps,
        "known_problems": blockers,
        "risk_areas": risks,
        "hotspot_files": hotspot_files,
        "task_risk": rmap.get("task_risk", {}),
        "task_groups": rmap.get("task_groups", []),
        "open_gaps": gaps,
        "gap_answers": gap_answers,
        "next_actions": actions,
        "risk_disclaimer": rmap["disclaimer"],
    }


def filter_content_by_scope(content: dict, scope: list[str] | set[str] | None) -> dict:
    """Filter assembled handover content according to ``recipient['scope']``.

    ``"project"``, ``"all"``, or ``"*"`` grants full-project view across all sections.
    Otherwise, only sections matching the granted scope tags are retained.
    """
    normalized = {str(s).strip().lower() for s in (scope or []) if str(s).strip()}
    if not normalized or normalized & {"project", "all", "*"}:
        return content

    filtered = copy.deepcopy(content)
    allow_decisions = bool(normalized & {"decisions", "decision"})
    allow_tasks = bool(normalized & {"tasks", "task"})
    allow_deps = bool(normalized & {"dependencies", "dependency"})
    allow_blockers = bool(normalized & {"known_problems", "blockers", "blocker", "problems"})
    allow_risks = bool(normalized & {"risk_areas", "risks", "risk", "risk_map"})
    allow_gaps = bool(normalized & {"open_gaps", "gaps", "gap", "gap_answers"})
    allow_actions = bool(normalized & {"next_actions", "actions"}) or allow_tasks or allow_risks or allow_gaps

    if not allow_decisions:
        filtered["decisions"] = []
        filtered["summary"]["decisions"] = 0
    if not allow_tasks:
        filtered["tasks"] = []
        filtered["summary"]["open_tasks"] = 0
    if not allow_deps:
        filtered["dependencies"] = []
        filtered["summary"]["dependencies"] = 0
    if not allow_blockers:
        filtered["known_problems"] = []
        filtered["summary"]["known_problems"] = 0
    if not allow_risks:
        filtered["risk_areas"] = []
        filtered["hotspot_files"] = []
        filtered["task_risk"] = {}
        filtered["task_groups"] = []
        filtered["summary"]["risk_areas"] = 0
    if not allow_gaps:
        filtered["open_gaps"] = []
        filtered["gap_answers"] = []
        filtered["summary"]["open_gaps"] = 0
        filtered["summary"]["gap_answers"] = 0
    if not allow_actions:
        filtered["next_actions"] = []

    return filtered


def approve(project: dict, approver_id: str, approver_role: str, now=None) -> dict:
    """Leader approval -> immutable version. Mutates project (approval, versions)."""
    if approver_role != "leader":
        raise AccessDenied("Only a team leader can approve a handover")
    ready = evaluate(project)
    if any(not r["passed"] for r in ready["rules"][:6]):
        raise NotReady("Rules 1 to 6 must pass before approval", ready)
    project["approval"] = {
        "approved_by": approver_id,
        "approved_by_role": approver_role,
        "approved_at": now_iso(now),
        "snapshot_hash": snapshot_hash(project),
    }
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


def get_handover(project: dict, role: str, user_id: str | None = None) -> dict:
    ready = evaluate(project)
    if role == "leader":
        content = build_content(project, eligible_only=False)
        return {
            "preview": ready["state"] != APPROVED,
            "readiness_state": ready["state"],
            "failing_rules": ready["failing_rules"],
            "content": content,
        }
    if role == "incoming":
        recipient = project.get("recipient") or {}
        if user_id != recipient.get("user_id"):
            raise AccessDenied("This handover was not assigned to you")
        if ready["state"] != APPROVED or not project.get("versions"):
            raise AccessDenied("The handover is not approved for sharing yet")
        v = project["versions"][-1]
        if v["snapshot_hash"] != ready["snapshot_hash"]:
            raise AccessDenied("Content changed after the last approval; waiting for re-approval")
        scoped_content = filter_content_by_scope(v["content"], recipient.get("scope"))
        return {
            "preview": False,
            "readiness_state": ready["state"],
            "version": v["version"],
            "content_hash": sha256(scoped_content),
            "content": scoped_content,
        }
    raise AccessDenied("Your role does not have access to the handover")


def list_versions(project: dict) -> list:
    return [
        {k: v[k] for k in ("version", "created_at", "approved_by", "snapshot_hash", "content_hash")}
        for v in project.get("versions", [])
    ]


def acknowledge(project: dict, version: int, user_id: str, now=None) -> dict:
    if user_id != (project.get("recipient") or {}).get("user_id"):
        raise AccessDenied("Only the assigned incoming member can acknowledge receipt")
    v = next((x for x in project.get("versions", []) if x["version"] == version), None)
    if v is None:
        raise KeyError(f"Version {version} does not exist")
    receipt = {
        "version": version,
        "user_id": user_id,
        "acknowledged_at": now_iso(now),
        "content_hash": v["content_hash"],
    }
    project.setdefault("receipts", []).append(receipt)
    return receipt
