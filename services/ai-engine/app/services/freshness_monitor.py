
from datetime import datetime, timezone, timedelta


def is_evidence_stale(
    recorded_at: str,
    max_age_days: int = 90,
) -> bool:
    try:
        recorded_date = datetime.fromisoformat(recorded_at)

        # Assume UTC if the timestamp has no timezone.
        if recorded_date.tzinfo is None:
            recorded_date = recorded_date.replace(
                tzinfo=timezone.utc
            )

        current_time = datetime.now(timezone.utc)
        age_limit = current_time - timedelta(days=max_age_days)

        return recorded_date < age_limit

    except ValueError:
        raise ValueError(
            "Invalid timestamp. Use ISO format, e.g. 2026-11-10."
        )
