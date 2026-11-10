
from datetime import datetime, timezone, timedelta


def is_evidence_stale(
    recorded_at: str,
    max_age_days: int = 90,
) -> bool:
    try:
        recorded_date = datetime.fromisoformat(recorded_at)

        if recorded_date.tzinfo is None:
            recorded_date = recorded_date.replace(
                tzinfo=timezone.utc
            )

        current_time = datetime.now(timezone.utc)
        age_limit = current_time - timedelta(days=max_age_days)

        return recorded_date < age_limit

    except (ValueError, TypeError):
        raise ValueError(
            "Invalid timestamp. Use ISO format, e.g. 2026-11-10."
        )


def scan_evidence_freshness(
    collection,
    max_age_days: int = 90,
    limit: int = 500,
):
    checked_at = datetime.now(timezone.utc).isoformat()

    report = {
        "scanned": 0,
        "current_count": 0,
        "stale_count": 0,
        "invalid_date_count": 0,
        "stale_evidence_ids": [],
        "invalid_date_evidence_ids": [],
        "max_age_days": max_age_days,
        "checked_at": checked_at,
    }

    records = collection.find(
        {},
        {"submitted_at": 1}
    ).limit(limit)

    for record in records:
        evidence_id = str(record["_id"])
        submitted_at = record.get("submitted_at")

        try:
            stale = is_evidence_stale(
                submitted_at,
                max_age_days
            )
            freshness_status = "stale" if stale else "current"

        except (ValueError, TypeError):
            freshness_status = "invalid_date"

        collection.update_one(
            {"_id": record["_id"]},
            {
                "$set": {
                    "freshness_status": freshness_status,
                    "freshness_checked_at": checked_at,
                    "freshness_max_age_days": max_age_days,
                }
            }
        )

        report["scanned"] += 1

        if freshness_status == "stale":
            report["stale_count"] += 1
            report["stale_evidence_ids"].append(evidence_id)

        elif freshness_status == "current":
            report["current_count"] += 1

        else:
            report["invalid_date_count"] += 1
            report["invalid_date_evidence_ids"].append(evidence_id)

    return report
