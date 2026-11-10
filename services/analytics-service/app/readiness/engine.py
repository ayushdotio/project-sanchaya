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
    })


def _rule(n, passed, reasons, blocking=True):
    return {"id": n, "name": RULE_NAMES[n], "passed": passed, "blocking": blocking, "reasons": reasons}


def evaluate(project: dict, required_source_types=None) -> dict:
    sources = project.get("sources", [])
    findings = project.get("findings", [])
    tasks = project.get("tasks", [])
    recipient = project.get("recipient") or {}
    required_source_types = set(required_source_types or [])
    rules = []

    # 1. sources verified
    r = []
    if not sources:
        r.append("No sources imported")
    for s in sources:
        if not s.get("source_id") or not s.get("timestamp"):
            r.append(f"Source {s.get('source_id', '?')} is missing an ID or timestamp")
        if not s.get("scan_completed"):
            r.append(f"Source {s.get('source_id', '?')} has not completed the secret/PII scan")
    missing = required_source_types - {s.get("type") for s in sources}
    for t in sorted(missing):
        r.append(f"Required source type not imported: {t}")
    rules.append(_rule(1, not r, r))

    # 2. decisions backed by evidence
    r = [f"{f['id']}: '{f['text']}' is {f['status']} and has no reviewer sign-off"
         for f in findings
         if f.get("category") == "decision" and f.get("status") != "Supported"
         and not f.get("reviewer_signoff") and f.get("status") not in ("Conflicting", "Unknown")]
    rules.append(_rule(2, not r, r))

    # 3. open tasks owned or explicitly unknown
    r = [f"{t['id']}: '{t['title']}' is {t['status']} with no owner"
         for t in tasks
         if t.get("status") in ("open", "blocked") and not t.get("assignee") and not t.get("owner_unknown")]
    rules.append(_rule(3, not r, r))

    # 4. blockers identified
    r = [f"{t['id']}: '{t['title']}' is blocked but names no blocker and has no sign-off"
         for t in tasks
         if t.get("status") == "blocked" and not t.get("blocker") and not t.get("reviewer_signoff")]
    rules.append(_rule(4, not r, r))

    # 5. conflicts / unknowns resolved or acknowledged
    r = [f"{f['id']}: '{f['text']}' is {f['status']} and neither resolved nor acknowledged"
         for f in findings
         if f.get("status") in ("Conflicting", "Unknown") and not f.get("resolved") and not f.get("reviewer_signoff")]
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
    return {"state": state, "snapshot_hash": cur, "rules": rules,
            "failing_rules": [x["id"] for x in rules if not x["passed"]]}
