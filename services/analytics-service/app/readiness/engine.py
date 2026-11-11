"""Handover Readiness Checklist engine: 7 transparent rules, pure function of a snapshot.

State:  Needs Attention  (any of rules 1-6 fails)
        Ready for Review (rules 1-6 pass, no valid approval)
        Approved for Sharing (all 7 pass)
Approval is bound to a SHA-256 hash of the snapshot, so any later change to an
included source, finding, task or recipient invalidates it automatically.
"""
from app.common import sha256

NEEDS_ATTENTION = "Needs Attention"
READY_FOR_REVIEW = "Ready for Review"
APPROVED = "Approved for Sharing"

RULE_NAMES = {
    1: "Imported sources verified",
    2: "Technical decisions backed by evidence",
    3: "Unfinished tasks owned or marked unknown",
    4: "Blockers and dependencies identified",
    5: "Conflicts and uncertainties disclosed",
    6: "Recipient permissions checked",
    7: "Team leader approval recorded",
}


def snapshot_hash(project: dict) -> str:
    """Hash of everything the handover is built from (approval itself excluded)."""
    return sha256({
        "sources": project.get("sources", []),
        "findings": project.get("findings", []),
        "tasks": project.get("tasks", []),
        "recipient": project.get("recipient"),
        "commits_digest": sha256(project.get("commits", [])),
        "alias_map": project.get("alias_map", {}),
        "name": project.get("name"),
        "departing_member": project.get("departing_member"),
    })


def _rule(n, passed, reasons, blocking=True):
    return {"id": n, "name": RULE_NAMES[n], "passed": passed, "blocking": blocking, "reasons": reasons}


def _source_timestamp(s: dict):
    return s.get("timestamp") or s.get("updated_at") or s.get("created_at") or s.get("imported_at")


def _source_scan_completed(s: dict) -> bool:
    if "scan_completed" in s:
        return bool(s.get("scan_completed"))
    meta = s.get("metadata")
    if isinstance(meta, dict) and "redactionCount" in meta:
        return True
    return "redacted_content" in s


def _source_type(s: dict):
    return s.get("type") or s.get("source_type")


def _finding_id(f: dict) -> str:
    return str(f.get("id") or f.get("_id") or "?")


def _finding_text(f: dict) -> str:
    return str(f.get("text") or f.get("claim") or "")


def _finding_status(f: dict) -> str:
    return str(f.get("status") or f.get("verification_status") or "Unknown")


def _finding_signoff(f: dict) -> bool:
    if f.get("reviewer_signoff"):
        return True
    return f.get("review_status") == "approved"


def _finding_resolved(f: dict) -> bool:
    if f.get("resolved"):
        return True
    return f.get("evidence_origin") == "self_reported" and _finding_status(f) == "Supported"


def evaluate(project: dict, required_source_types=None) -> dict:
    sources = project.get("sources", [])
    findings = project.get("findings", [])
    tasks = project.get("tasks", [])
    recipient = project.get("recipient") or {}
    if required_source_types is None:
        required_source_types = project.get("required_source_types")
    required_source_types = set(required_source_types or [])
    rules = []

    # 1. sources verified
    r = []
    if not sources:
        r.append("No sources imported")
    for s in sources:
        if not s.get("source_id") or not _source_timestamp(s):
            r.append(f"Source {s.get('source_id', '?')} is missing an ID or timestamp")
        if not _source_scan_completed(s):
            r.append(f"Source {s.get('source_id', '?')} has not completed the secret/PII scan")
    missing = required_source_types - {_source_type(s) for s in sources}
    for t in sorted(missing):
        r.append(f"Required source type not imported: {t}")
    rules.append(_rule(1, not r, r))

    # 2. decisions backed by evidence
    r = [
        f"{_finding_id(f)}: '{_finding_text(f)}' is {_finding_status(f)} and has no reviewer sign-off"
        for f in findings
        if f.get("category") == "decision"
        and _finding_status(f) != "Supported"
        and not _finding_signoff(f)
        and _finding_status(f) not in ("Conflicting", "Unknown")
    ]
    rules.append(_rule(2, not r, r))

    # 3. open tasks owned or explicitly unknown
    r = [
        f"{t['id']}: '{t['title']}' is {t['status']} with no owner"
        for t in tasks
        if t.get("status") in ("open", "blocked") and not t.get("assignee") and not t.get("owner_unknown")
    ]
    rules.append(_rule(3, not r, r))

    # 4. blockers identified
    r = [
        f"{t['id']}: '{t['title']}' is blocked but names no blocker and has no sign-off"
        for t in tasks
        if t.get("status") == "blocked" and not t.get("blocker") and not t.get("reviewer_signoff")
    ]
    rules.append(_rule(4, not r, r))

    # 5. conflicts / unknowns resolved or acknowledged
    r = [
        f"{_finding_id(f)}: '{_finding_text(f)}' is {_finding_status(f)} and neither resolved nor acknowledged"
        for f in findings
        if _finding_status(f) in ("Conflicting", "Unknown")
        and not _finding_resolved(f)
        and not _finding_signoff(f)
    ]
    rules.append(_rule(5, not r, r))

    # 6. recipient permissions
    r = []
    if not recipient.get("user_id"):
        r.append("No incoming member assigned")
    if recipient.get("role") != "incoming":
        r.append("Recipient does not have the incoming-member role")
    if not recipient.get("scope"):
        r.append("Recipient has no view scope assigned")
    rules.append(_rule(6, not r, r))

    # 7. leader approval bound to current content
    cur = snapshot_hash(project)
    appr = project.get("approval")
    r = []
    if not appr:
        r.append("No leader approval recorded")
    else:
        if appr.get("approved_by_role") != "leader":
            r.append("Approval was not given by a user with the leader role")
        if appr.get("snapshot_hash") != cur:
            r.append("Content changed after approval: approval is no longer valid")
    rules.append(_rule(7, not r, r, blocking=False))

    first_six_ok = all(x["passed"] for x in rules[:6])
    if not first_six_ok:
        state = NEEDS_ATTENTION
    elif not rules[6]["passed"]:
        state = READY_FOR_REVIEW
    else:
        state = APPROVED
    return {
        "state": state,
        "snapshot_hash": cur,
        "rules": rules,
        "failing_rules": [x["id"] for x in rules if not x["passed"]],
    }
