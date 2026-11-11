"""Lazy MongoDB connection and canonical Sanchaya collection accessors."""

from __future__ import annotations

from typing import Any

from app.core.config import get_settings

try:
    from pymongo import MongoClient
    from pymongo.errors import ConfigurationError
except ImportError:  # pragma: no cover - allows importing in slim test environments
    MongoClient = None  # type: ignore[assignment]
    ConfigurationError = Exception  # type: ignore[assignment, misc]

_client: Any = None
_database_override: Any = None


def set_database(db: Any) -> None:
    """Inject a database instance (e.g. mongomock or fake DB) for testing."""
    global _database_override
    _database_override = db


def reset_database() -> None:
    """Clear any injected database override and close cached MongoClient."""
    global _client, _database_override
    _database_override = None
    if _client is not None:
        try:
            _client.close()
        except Exception:
            pass
        _client = None


def get_client() -> Any:
    """Lazily construct and cache the ``MongoClient``."""
    global _client
    if _client is not None:
        return _client

    if MongoClient is None:
        raise RuntimeError("pymongo is not installed in the current environment.")

    settings = get_settings()
    if not settings.mongo_uri:
        raise RuntimeError(
            "MONGO_URI is not configured. Set MONGO_URI in the root .env or environment."
        )

    _client = MongoClient(settings.mongo_uri, serverSelectionTimeoutMS=10000)
    return _client


def get_database(database_name: str | None = None) -> Any:
    """Return the Sanchaya MongoDB database.

    Resolution order:
      1. Injected test database override (if set)
      2. Explicit ``database_name`` argument (e.g. from backend Mongoose connection)
      3. Default database embedded in ``MONGO_URI``, falling back to ``settings.database_name``
    """
    if _database_override is not None:
        return _database_override

    settings = get_settings()
    client = get_client()

    if database_name and database_name.strip():
        return client[database_name.strip()]

    try:
        return client.get_default_database(default=settings.database_name)
    except ConfigurationError:
        return client[settings.database_name]


def get_source_records_collection(db: Any = None) -> Any:
    """Return the canonical ``source_records`` collection."""
    target_db = db if db is not None else get_database()
    return target_db["source_records"]


def get_findings_collection(db: Any = None) -> Any:
    """Return the canonical ``findings`` collection."""
    target_db = db if db is not None else get_database()
    return target_db["findings"]


def get_gap_questions_collection(db: Any = None) -> Any:
    """Return the canonical ``gap_questions`` collection."""
    target_db = db if db is not None else get_database()
    return target_db["gap_questions"]


def check_mongodb_connection() -> bool:
    """Verify MongoDB connectivity via a ``ping`` command."""
    if _database_override is not None:
        if hasattr(_database_override, "command"):
            _database_override.command("ping")
        return True

    client = get_client()
    client.admin.command("ping")
    return True
