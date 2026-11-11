"""Stage 3 Freshness Monitoring: Source timestamp tracking & activity comparison."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from app.models.schemas import FreshnessInfo
from app.services.evidence_validator import parse_utc_datetime

try:
    from pymongo import UpdateOne
except ImportError:  # pragma: no cover
    UpdateOne = None  # type: ignore[assignment]


def is_evidence_stale(
    recorded_at: str | datetime,
    max_age_days: int = 90,
) -> bool:
    """Return True if ``recorded_at`` is older than ``max_age_days``."""
    recorded_date = parse_utc_datetime(recorded_at)
    if recorded_date is None:
        raise ValueError("Invalid timestamp. Use ISO format, e.g. 2026-11-10.")

    current_time = datetime.now(timezone.utc)
    age_limit = current_time - timedelta(days=max_age_days)
    return recorded_date < age_limit


def _extract_source_timestamp(record: dict[str, Any]) -> datetime | None:
    for field in ("updated_at", "created_at", "imported_at", "submitted_at"):
        dt = parse_utc_datetime(record.get(field))
        if dt is not None:
            return dt
    return None


def get_latest_project_activity(source_records: list[dict[str, Any]]) -> datetime | None:
    """Return the most recent ``updated_at`` / ``created_at`` timestamp across project sources."""
    timestamps: list[datetime] = []
    for record in source_records:
        for field in ("updated_at", "created_at"):
            dt = parse_utc_datetime(record.get(field))
            if dt is not None:
                timestamps.append(dt)
                break
    return max(timestamps) if timestamps else None


def evaluate_finding_freshness(
    source_record: dict[str, Any] | None,
    latest_project_activity_at: datetime | str | None = None,
    max_age_days: int = 90,
) -> FreshnessInfo:
    """Evaluate freshness of a finding's backing ``source_record``.

    Compares ``source_record.updated_at`` (falling back to ``created_at`` /
    ``imported_at``) against ``latest_project_activity_at`` and ``max_age_days``.
    """
    if not source_record:
        return FreshnessInfo(
            source_updated_at=None,
            recheck_recommended=True,
            reason="Backing source record is missing; re-check recommended.",
        )

    source_dt = _extract_source_timestamp(source_record)
    if source_dt is None:
        return FreshnessInfo(
            source_updated_at=None,
            recheck_recommended=True,
            reason="Source record lacks a valid created_at/updated_at timestamp.",
        )

    source_iso = source_dt.isoformat()
    latest_dt = parse_utc_datetime(latest_project_activity_at)

    if latest_dt is not None and latest_dt > source_dt:
        return FreshnessInfo(
            source_updated_at=source_iso,
            recheck_recommended=True,
            reason=(
                f"Newer project activity ({latest_dt.date().isoformat()}) occurred after "
                f"this source was last updated ({source_dt.date().isoformat()})."
            ),
        )

    if is_evidence_stale(source_dt, max_age_days=max_age_days):
        return FreshnessInfo(
            source_updated_at=source_iso,
            recheck_recommended=True,
            reason=f"Source record is older than {max_age_days} days.",
        )

    return FreshnessInfo(
        source_updated_at=source_iso,
        recheck_recommended=False,
        reason=None,
    )


def scan_evidence_freshness(
    collection: Any,
    max_age_days: int = 90,
    limit: int = 500,
    project_id: Any = None,
) -> dict[str, Any]:
    """Scan a MongoDB collection for stale timestamps using batched ``bulk_write``."""
    checked_at = datetime.now(timezone.utc).isoformat()
    query_filter: dict[str, Any] = {}
    if project_id is not None:
        query_filter["projectId"] = project_id

    report: dict[str, Any] = {
        "scanned": 0,
        "current_count": 0,
        "stale_count": 0,
        "invalid_date_count": 0,
        "stale_evidence_ids": [],
        "invalid_date_evidence_ids": [],
        "max_age_days": max_age_days,
        "checked_at": checked_at,
    }

    records = list(
        collection.find(
            query_filter,
            {"updated_at": 1, "created_at": 1, "imported_at": 1, "submitted_at": 1, "freshness": 1},
        ).limit(limit)
    )

    bulk_ops: list[Any] = []
    fallback_updates: list[tuple[Any, dict[str, Any]]] = []

    for record in records:
        evidence_id = str(record["_id"])
        raw_ts = (
            record.get("updated_at")
            or record.get("created_at")
            or record.get("imported_at")
            or record.get("submitted_at")
            or (record.get("freshness") or {}).get("source_updated_at")
        )

        try:
            stale = is_evidence_stale(raw_ts, max_age_days)
            freshness_status = "stale" if stale else "current"
        except (ValueError, TypeError):
            freshness_status = "invalid_date"

        update_fields = {
            "freshness_status": freshness_status,
            "freshness_checked_at": checked_at,
            "freshness_max_age_days": max_age_days,
            "freshness.recheck_recommended": freshness_status != "current",
        }

        if UpdateOne is not None and hasattr(collection, "bulk_write"):
            bulk_ops.append(UpdateOne({"_id": record["_id"]}, {"$set": update_fields}))
        else:
            fallback_updates.append((record["_id"], update_fields))

        report["scanned"] += 1
        if freshness_status == "stale":
            report["stale_count"] += 1
            report["stale_evidence_ids"].append(evidence_id)
        elif freshness_status == "current":
            report["current_count"] += 1
        else:
            report["invalid_date_count"] += 1
            report["invalid_date_evidence_ids"].append(evidence_id)

    if bulk_ops:
        collection.bulk_write(bulk_ops, ordered=False)
    else:
        for doc_id, fields in fallback_updates:
            collection.update_one({"_id": doc_id}, {"$set": fields})

    return report
