"""Shared helpers: canonical JSON, hashing, timestamps."""
import hashlib
import json
from datetime import datetime, timezone


def canonical(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)


def sha256(obj) -> str:
    return hashlib.sha256(canonical(obj).encode("utf-8")).hexdigest()


def parse_ts(ts) -> datetime:
    if isinstance(ts, datetime):
        dt = ts
    else:
        dt = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def now_iso(now=None) -> str:
    return (now or datetime.now(timezone.utc)).isoformat(timespec="seconds")
