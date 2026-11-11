"""Project store and canonical MongoDB repository bridge.
 - MONGO_URI set        -> MongoStore (same MongoDB as the gateway; collection 'analytics_projects')
                           and get_canonical_database() for canonical Sanchaya collections
 - SANCHAYA_STORE=path  -> JSON file
 - otherwise            -> in-memory (tests, quick demos)
"""

from __future__ import annotations

import json
import os
from threading import Lock
from typing import Any

from app.config import get_database_name, get_mongo_uri, load_root_env

load_root_env()

_canonical_client: Any = None
_canonical_db_override: Any = None


class ProjectStore:
    kind = "memory"

    def __init__(self, path=None):
        self.path, self._lock, self._data = path or os.getenv("SANCHAYA_STORE"), Lock(), {}
        if self.path:
            self.kind = "file"
            if os.path.exists(self.path):
                with open(self.path) as fh:
                    self._data = json.load(fh)

    def get(self, pid):
        if pid not in self._data:
            raise KeyError(pid)
        return self._data[pid]

    def put(self, pid, project):
        with self._lock:
            self._data[pid] = project
            self.save()

    def create(self, pid, project):
        with self._lock:
            if pid in self._data:
                return False
            self._data[pid] = project
            self.save()
            return True

    def save(self):
        if self.path:
            with open(self.path, "w") as fh:
                json.dump(self._data, fh, default=str)


class MongoStore:
    """Each project is one document {_id, doc}. `doc` is a JSON string, which avoids
    MongoDB field-name problems (emails in alias_map contain dots)."""

    kind = "mongo"

    def __init__(self, uri=None, client=None, db_name="sanchaya", collection="analytics_projects"):
        if client is None:
            from pymongo import MongoClient

            client = MongoClient(uri, serverSelectionTimeoutMS=5000)
        self.client = client
        try:
            self.db = client.get_default_database(default=db_name)
        except Exception:
            self.db = client[db_name]
        self.col = self.db[collection]

    def get(self, pid):
        doc = self.col.find_one({"_id": pid})
        if doc is None:
            raise KeyError(pid)
        return json.loads(doc["doc"])

    def put(self, pid, project):
        # Optimistic concurrency guard when updating existing snapshots
        existing = self.col.find_one({"_id": pid}, {"rev": 1})
        payload = json.dumps(project, default=str)
        if existing is None:
            self.col.replace_one({"_id": pid}, {"_id": pid, "doc": payload, "rev": 1}, upsert=True)
            return

        current_rev = existing.get("rev", 0)
        res = self.col.update_one(
            {"_id": pid, "rev": current_rev} if "rev" in existing else {"_id": pid},
            {"$set": {"doc": payload, "rev": current_rev + 1}},
        )
        if res.matched_count == 0:
            self.col.replace_one({"_id": pid}, {"_id": pid, "doc": payload, "rev": current_rev + 1}, upsert=True)

    def create(self, pid, project):
        from pymongo.errors import DuplicateKeyError

        try:
            self.col.insert_one(
                {
                    "_id": pid,
                    "doc": json.dumps(project, default=str),
                    "rev": 1,
                }
            )
            return True
        except DuplicateKeyError:
            return False

    def save(self):  # writes happen in put()
        pass


def set_canonical_database(db: Any) -> None:
    """Inject a canonical database override (e.g. mongomock) for tests."""
    global _canonical_db_override
    _canonical_db_override = db


def reset_canonical_database() -> None:
    """Reset any injected canonical DB override and close cached MongoClient."""
    global _canonical_client, _canonical_db_override
    _canonical_db_override = None
    if _canonical_client is not None:
        try:
            _canonical_client.close()
        except Exception:
            pass
        _canonical_client = None


def get_canonical_database(uri: str | None = None, db_name: str | None = None) -> Any:
    """Return the shared canonical Sanchaya MongoDB database lazily."""
    global _canonical_client
    if _canonical_db_override is not None:
        return _canonical_db_override

    resolved_uri = uri or get_mongo_uri()
    if not resolved_uri:
        raise RuntimeError(
            "MONGO_URI is not configured. Set MONGO_URI in the root .env or container environment."
        )

    from pymongo import MongoClient
    from pymongo.errors import ConfigurationError

    if _canonical_client is None:
        _canonical_client = MongoClient(resolved_uri, serverSelectionTimeoutMS=5000)

    default_db = db_name or get_database_name()
    try:
        return _canonical_client.get_default_database(default=default_db)
    except ConfigurationError:
        return _canonical_client[default_db]


def ensure_canonical_indexes(db: Any) -> None:
    """Ensure atomic unique index on handover_history(projectId, version)."""
    try:
        db["handover_history"].create_index(
            [("projectId", 1), ("version", 1)],
            unique=True,
            name="uniq_project_handover_version",
        )
    except Exception:
        pass


def make_store():
    uri = get_mongo_uri()
    if uri:
        try:
            return MongoStore(uri)
        except ImportError:
            return ProjectStore()
    return ProjectStore()


class _LazyStore:
    """Defer MongoClient / ProjectStore creation until first runtime access."""

    def __init__(self):
        self._instance: Any = None

    def _get_instance(self):
        if self._instance is None:
            self._instance = make_store()
        return self._instance

    @property
    def kind(self):
        return self._get_instance().kind

    def get(self, pid):
        return self._get_instance().get(pid)

    def put(self, pid, project):
        return self._get_instance().put(pid, project)

    def create(self, pid, project):
        return self._get_instance().create(pid, project)

    def save(self):
        return self._get_instance().save()


STORE = _LazyStore()
