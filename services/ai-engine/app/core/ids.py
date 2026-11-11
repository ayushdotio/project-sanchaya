"""Helpers for MongoDB ObjectId parsing and validation."""

from __future__ import annotations

import re
from typing import Any

try:
    from bson import ObjectId as BsonObjectId
except ImportError:  # pragma: no cover - fallback when pymongo/bson is absent
    BsonObjectId = None

_OBJECT_ID_RE = re.compile(r"^[0-9a-fA-F]{24}$")


def is_valid_object_id(value: Any) -> bool:
    """Return True if ``value`` is a valid 24-hex ObjectId or ``bson.ObjectId``."""
    if BsonObjectId is not None and isinstance(value, BsonObjectId):
        return True
    if not isinstance(value, str):
        return False
    if BsonObjectId is not None:
        return BsonObjectId.is_valid(value)
    return bool(_OBJECT_ID_RE.match(value))


def parse_object_id(value: Any) -> Any:
    """Parse ``value`` into a ``bson.ObjectId`` (or validated string if bson unavailable).

    Raises ``ValueError`` if ``value`` is not a valid ObjectId.
    """
    if BsonObjectId is not None and isinstance(value, BsonObjectId):
        return value
    if not is_valid_object_id(value):
        raise ValueError(f"Invalid ObjectId: {value!r}")
    if BsonObjectId is not None:
        return BsonObjectId(value)
    return value

