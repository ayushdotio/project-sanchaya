"""Canonical MongoDB mapper and Stage 2-5 analytics orchestration."""

from __future__ import annotations

import io
import re
from datetime import datetime, timezone
from typing import Any

from app.analytics.risk_analyzer import analyze
from app.common import now_iso, sha256
from app.handover import assembly
from app.readiness.engine import APPROVED, evaluate, snapshot_hash
from app.store import ensure_canonical_indexes

try:
    from bson import ObjectId as BsonObjectId
except ImportError:  # pragma: no cover
    BsonObjectId = None

_OID_RE = re.compile(r"^[0-9a-fA-F]{24}$")
_PATH_RE = re.compile(r"\b(?:[a-zA-Z0-9_.-]+/)+[a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+\b")


def parse_object_id(value: Any) -> Any:
    if BsonObjectId is not None and isinstance(value, BsonObjectId):
        return value
    if not isinstance(value, str) or not _OID_RE.match(value):
        raise ValueError(f"Invalid projectId: {value!r}")
    return BsonObjectId(value) if BsonObjectId is not None else value


def _extract_files_from_source(rec: dict[str, Any]) -> list[dict[str, Any]]:
    meta = rec.get("metadata") or {}
    file_path = (meta.get("filePath") or "").strip() if isinstance(meta, dict) else ""
    content = str(rec.get("redacted_content") or "")
    paths: list[str] = []
    if file_path:
        paths.append(file_path)
    for match in _PATH_RE.findall(content):
        if match not in paths:
            paths.append(match)
    if not paths:
        fallback = str(rec.get("raw_filename") or rec.get("origin") or "repo/general").strip()
        paths.append(fallback)
    return [{"path": p, "additions": 1, "deletions": 0} for p in paths[:10]]


def _resolve_user_name(users_by_id: dict[str, dict[str, Any]], user_id: Any) -> str | None:
    if not user_id:
        return None
    u = users_by_id.get(str(user_id))
    if not u:
        return None
    return str(u.get("name") or u.get("email") or str(user_id))


def load_canonical_project_snapshot(db: Any, project_id_str: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """Load canonical MongoDB collections and map to analytics snapshot shape."""
    project_oid = parse_object_id(project_id_str)
    project = db["projects"].find_one({"_id": {"$in": [project_oid, project_id_str]}})
    if project is None:
        raise KeyError(f"Project '{project_id_str}' not found")

    pid_filter = {"projectId": {"$in": [project_oid, project_id_str]}}
    source_records = list(db["source_records"].find(pid_filter))
    finding_docs = list(db["findings"].find(pid_filter))
    gap_question_docs = list(db["gap_questions"].find(pid_filter))
    handover_docs = list(db["handover_history"].find(pid_filter))

    # Load referenced member profiles from users if collection exists
    members = project.get("members") or {}
    member_ids: list[Any] = []
    for raw_id in [members.get("leaderId"), *(members.get("outgoingIds") or []), *(members.get("incomingIds") or [])]:
        if raw_id:
            member_ids.append(raw_id)
    users_by_id: dict[str, dict[str, Any]] = {}
    if member_ids and "users" in (db.list_collection_names() if hasattr(db, "list_collection_names") else ["users"]):
        for u in db["users"].find({"_id": {"$in": member_ids}}):
            users_by_id[str(u["_id"])] = u

    # 1. Sources
    sources = []
    commits = []
    for rec in source_records:
        ts = rec.get("updated_at") or rec.get("created_at") or rec.get("imported_at")
        meta = rec.get("metadata") or {}
        sources.append(
            {
                "source_id": rec.get("source_id"),
                "type": rec.get("source_type"),
                "timestamp": ts.isoformat() if isinstance(ts, datetime) else str(ts or ""),
                "scan_completed": "redacted_content" in rec,
            }
        )
        if rec.get("source_type") == "github":
            commits.append(
                {
                    "sha": (meta.get("sha") if isinstance(meta, dict) else None) or rec.get("source_id"),
                    "author": (meta.get("author") if isinstance(meta, dict) else None) or "unknown",
                    "email": "",
                    "timestamp": ts.isoformat() if isinstance(ts, datetime) else str(ts or now_iso()),
                    "files": _extract_files_from_source(rec),
                }
            )

    # 2. Findings & Tasks
    findings = []
    tasks = []
    for f in finding_docs:
        fid = str(f.get("_id", f.get("source_id", "")))
        status = f.get("verification_status", "Unknown")
        review_status = f.get("review_status", "pending")
        signoff = review_status == "approved"
        resolved = bool(f.get("evidence_origin") == "self_reported" and status == "Supported")
        findings.append(
            {
                "id": fid,
                "category": f.get("category", "decision"),
                "text": f.get("claim", ""),
                "status": status,
                "source_id": f.get("source_id", ""),
                "excerpt": f.get("verbatim_excerpt", ""),
                "freshness": f.get("freshness", "unknown"),
                "reviewer_signoff": signoff,
                "resolved": resolved,
                "conflicts_with": f.get("conflicting_source_id"),
                "evidence_origin": f.get("evidence_origin", "system"),
            }
        )
        if f.get("category") in ("task", "blocker"):
            task_status = "blocked" if f.get("category") == "blocker" else ("done" if signoff else "open")
            owner = f.get("owner")
            is_unknown_owner = isinstance(owner, str) and owner.strip().casefold() == "unknown"
            tasks.append(
                {
                    "id": fid,
                    "title": f.get("claim", ""),
                    "assignee": None if is_unknown_owner else owner,
                    "owner_unknown": is_unknown_owner,
                    "status": task_status,
                    "blocker": f.get("claim") if f.get("category") == "blocker" else None,
                    "reviewer_signoff": signoff,
                    "group": f.get("topic") or f.get("category"),
                }
            )

    # 3. Departing member & incoming recipient
    outgoing_ids = members.get("outgoingIds") or []
    incoming_ids = members.get("incomingIds") or []
    departing_member = _resolve_user_name(users_by_id, outgoing_ids[0]) if outgoing_ids else None
    if not departing_member and outgoing_ids:
        departing_member = str(outgoing_ids[0])

    recipient = {}
    if incoming_ids:
        inc_id = str(incoming_ids[0])
        inc_name = _resolve_user_name(users_by_id, incoming_ids[0]) or inc_id
        recipient = {
            "user_id": inc_id,
            "name": inc_name,
            "role": "incoming",
            "scope": project.get("recipientScope") or ["project"],
        }

    # 4. Self-reported gap answers
    gap_answers = [
        {
            "question": q.get("question", ""),
            "answer": q.get("answer", ""),
            "evidence_badge": q.get("evidence_badge", "Self-reported"),
            "answered_at": q.get("answeredAt").isoformat()
            if isinstance(q.get("answeredAt"), datetime)
            else str(q.get("answeredAt") or ""),
        }
        for q in gap_question_docs
        if q.get("status") in ("answered", "approved") and q.get("answer")
    ]

    # 5. Planned required source types
    planned_types = list(project.get("plannedSourceTypes") or [])
    if not planned_types and project.get("githubRepo"):
        planned_types = ["github"]

    snapshot = {
        "project_id": project_id_str,
        "name": project.get("name", ""),
        "departing_member": departing_member or "Outgoing member",
        "alias_map": project.get("alias_map", {}),
        "sources": sources,
        "commits": commits,
        "findings": findings,
        "tasks": tasks,
        "recipient": recipient,
        "gap_answers": gap_answers,
        "required_source_types": planned_types,
        "approval": None,
    }

    # Reconstruct leader approval binding if already recorded on Project
    checklist = project.get("readinessChecklist") or {}
    if project.get("readinessStatus") == APPROVED or checklist.get("leaderApprovalRecorded"):
        stored_hash = project.get("approvedSnapshotHash") or snapshot_hash(snapshot)
        snapshot["approval"] = {
            "approved_by": str(project.get("approvedBy") or members.get("leaderId") or "leader"),
            "approved_by_role": "leader",
            "approved_at": (
                project["approvedAt"].isoformat()
                if isinstance(project.get("approvedAt"), datetime)
                else str(project.get("approvedAt") or now_iso())
            ),
            "snapshot_hash": stored_hash,
        }

    raw = {
        "project": project,
        "project_oid": project_oid,
        "source_records": source_records,
        "findings": finding_docs,
        "gap_questions": gap_question_docs,
        "handover_history": handover_docs,
    }
    return snapshot, raw


def compute_risk_and_readiness_for_project(db: Any, project_id_str: str) -> dict[str, Any]:
    """Compute risk map + 7-rule readiness, persist to ``risk_maps`` and sync ``projects``."""
    snapshot, raw = load_canonical_project_snapshot(db, project_id_str)
    project_doc = raw["project"]
    project_oid = raw["project_oid"]

    risk_data = analyze(
        snapshot["commits"],
        snapshot["tasks"],
        snapshot["departing_member"],
        snapshot["alias_map"],
    )
    readiness = evaluate(snapshot, required_source_types=snapshot.get("required_source_types"))

    # Persist risk_maps documents matching docs/database/database-schema.md
    now = datetime.now(timezone.utc)
    db["risk_maps"].delete_many({"projectId": {"$in": [project_oid, project_id_str]}})
    risk_rows = [
        {
            "projectId": project_oid,
            "modulePath": u["unit"],
            "primaryContributor": u["top_contributor"],
            "contributionPercentage": round(u["top_commit_share"] * 100, 1),
            "totalCommits": u["total_changes"],
            "riskTier": u["level"],
            "notes": u["notes"],
            "updatedAt": now,
        }
        for u in risk_data.get("units", [])
    ]
    if risk_rows:
        db["risk_maps"].insert_many(risk_rows)

    rules_by_id = {r["id"]: r["passed"] for r in readiness["rules"]}
    checklist = {
        "sourcesVerified": bool(rules_by_id.get(1, False)),
        "decisionsBackedByEvidence": bool(rules_by_id.get(2, False)),
        "unfinishedTasksAssignedOrUnknown": bool(rules_by_id.get(3, False)),
        "blockersIdentified": bool(rules_by_id.get(4, False)),
        "conflictsDisclosed": bool(rules_by_id.get(5, False)),
        "recipientPermissionsChecked": bool(rules_by_id.get(6, False)),
        "leaderApprovalRecorded": bool(rules_by_id.get(7, False)),
    }

    update_set: dict[str, Any] = {
        "readinessChecklist": checklist,
        "readinessStatus": readiness["state"],
        "approvedSnapshotHash": readiness["snapshot_hash"] if readiness["state"] == APPROVED else None,
        "updatedAt": now,
    }
    # WR-02: If previously Approved for Sharing but content invalidated approval, clear approval metadata
    if project_doc.get("readinessStatus") == APPROVED and readiness["state"] != APPROVED:
        update_set["approvedBy"] = None
        update_set["approvedAt"] = None

    db["projects"].update_one({"_id": project_doc["_id"]}, {"$set": update_set})

    return {
        "success": True,
        "message": "Contribution concentration risk and readiness checklist evaluated.",
        "readinessStatus": readiness["state"],
        "checklist": checklist,
        "riskSummary": {
            **risk_data,
            "rules": readiness["rules"],
            "failing_rules": readiness["failing_rules"],
            "snapshot_hash": readiness["snapshot_hash"],
        },
    }


def build_pdf_bytes_for_project(
    db: Any,
    project_id_str: str,
    allow_draft: bool = False,
) -> bytes:
    """Render an approved handover package into an in-memory PDF byte buffer."""
    snapshot, raw = load_canonical_project_snapshot(db, project_id_str)
    project_doc = raw["project"]
    project_oid = raw["project_oid"]

    if not allow_draft and project_doc.get("readinessStatus") != APPROVED:
        raise PermissionError(
            "Handover PDF export requires readinessStatus === 'Approved for Sharing'."
        )

    risk_data = analyze(
        snapshot["commits"],
        snapshot["tasks"],
        snapshot["departing_member"],
        snapshot["alias_map"],
    )
    readiness = evaluate(snapshot, required_source_types=snapshot.get("required_source_types"))
    if project_doc.get("readinessStatus") == APPROVED:
        readiness["state"] = APPROVED

    content = assembly.build_content(snapshot, risk_data, eligible_only=not allow_draft)
    recipient = snapshot.get("recipient") or {}
    if recipient.get("scope"):
        content = assembly.filter_content_by_scope(content, recipient["scope"])

    handover_docs = sorted(raw["handover_history"], key=lambda d: d.get("version", 0))
    latest_doc = handover_docs[-1] if handover_docs else None
    version_num = int(latest_doc.get("version", 1)) if latest_doc else 1
    approved_at = (
        project_doc["approvedAt"].isoformat()
        if isinstance(project_doc.get("approvedAt"), datetime)
        else str(project_doc.get("approvedAt") or now_iso())
    )

    version_payload = {
        "version": version_num,
        "created_at": approved_at,
        "approved_by": str(project_doc.get("approvedBy") or "leader"),
        "snapshot_hash": readiness["snapshot_hash"],
        "content_hash": sha256(content),
        "readiness": readiness,
        "content": content,
        "risk_map": risk_data,
    }

    now = datetime.now(timezone.utc)
    if latest_doc is not None:
        db["handover_history"].update_one(
            {"_id": latest_doc["_id"]},
            {"$set": {"pdfExportedAt": now, "updatedAt": now}},
        )
    else:
        ensure_canonical_indexes(db)
        try:
            db["handover_history"].insert_one(
                {
                    "projectId": project_oid,
                    "version": 1,
                    "approvedSnapshot": {
                        "projectName": project_doc.get("name", ""),
                        "readinessStatus": project_doc.get("readinessStatus"),
                        "snapshotHash": readiness["snapshot_hash"],
                        "contentHash": version_payload["content_hash"],
                    },
                    "pdfExportedAt": now,
                    "createdAt": now,
                    "updatedAt": now,
                }
            )
        except Exception:
            pass

    from app.pdf.pdf_generator import generate_pdf

    buffer = io.BytesIO()
    generate_pdf(version_payload, buffer)
    return buffer.getvalue()
