"""Centralized configuration and root .env discovery for Analytics Service."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


def load_root_env(start_dir: Path | None = None, max_levels: int = 6) -> Path | None:
    """Walk parent directories to locate and load the single root .env file.

    Uses ``override=False`` so explicit Docker/process environment variables
    always take precedence over ``.env`` values.
    """
    current = (start_dir or Path(__file__).resolve().parent).resolve()
    for _ in range(max_levels):
        candidate = current / ".env"
        if candidate.is_file():
            load_dotenv(candidate, override=False)
            return candidate
        parent = current.parent
        if parent == current:
            break
        current = parent
    load_dotenv(override=False)
    return None


def get_mongo_uri() -> str | None:
    load_root_env()
    return (os.getenv("MONGO_URI") or "").strip() or None


def get_database_name() -> str:
    load_root_env()
    return (os.getenv("DATABASE_NAME") or "sanchaya").strip() or "sanchaya"


def get_internal_api_token() -> str | None:
    load_root_env()
    return (os.getenv("INTERNAL_API_TOKEN") or "").strip() or None

