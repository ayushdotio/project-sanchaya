"""Centralized configuration and root .env loading for Sanchaya AI Engine."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from pydantic import BaseModel, Field


def load_root_env(start_dir: Path | None = None, max_levels: int = 6) -> Path | None:
    """Walk parent directories to locate and load the single root .env file.

    Uses ``override=False`` so explicit container/process environment variables
    always take precedence over values in ``.env``.
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


class Settings(BaseModel):
    """Runtime settings for the AI Engine microservice."""

    mongo_uri: str | None = Field(default=None)
    database_name: str = Field(default="sanchaya")

    # LLM provider routing: "auto" | "gemini" | "openrouter" | "openai"
    llm_provider: Literal["auto", "gemini", "openrouter", "openai"] = Field(default="auto")
    llm_model: str | None = Field(default=None)

    # Google Gemini API
    gemini_api_key: str | None = Field(default=None)
    gemini_model: str = Field(default="gemini-2.5-flash")
    gemini_base_url: str = Field(default="https://generativelanguage.googleapis.com/v1beta")

    # OpenRouter API
    openrouter_api_key: str | None = Field(default=None)
    openrouter_model: str = Field(default="google/gemini-2.5-flash")
    openrouter_base_url: str = Field(default="https://openrouter.ai/api/v1")
    openrouter_site_url: str = Field(default="http://localhost:5173")
    openrouter_app_name: str = Field(default="Sanchaya AI Engine")

    # OpenAI / OpenAI-compatible API
    openai_api_key: str | None = Field(default=None)
    openai_model: str = Field(default="gpt-4o-mini")
    openai_base_url: str | None = Field(default=None)

    internal_api_token: str | None = Field(default=None)
    freshness_max_age_days: int = Field(default=90, ge=1, le=3650)

    @classmethod
    def from_env(cls) -> "Settings":
        load_root_env()
        raw_max_age = os.getenv("FRESHNESS_MAX_AGE_DAYS", "90").strip()
        try:
            max_age_days = int(raw_max_age)
        except ValueError:
            max_age_days = 90

        raw_provider = (os.getenv("LLM_PROVIDER") or "auto").strip().lower()
        if raw_provider not in {"auto", "gemini", "openrouter", "openai"}:
            raw_provider = "auto"

        gemini_key = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip() or None
        openrouter_key = (os.getenv("OPENROUTER_API_KEY") or "").strip() or None
        openai_key = (os.getenv("OPENAI_API_KEY") or "").strip() or None

        return cls(
            mongo_uri=os.getenv("MONGO_URI") or None,
            database_name=os.getenv("DATABASE_NAME", "sanchaya").strip() or "sanchaya",
            llm_provider=raw_provider,  # type: ignore[arg-type]
            llm_model=(os.getenv("LLM_MODEL") or "").strip() or None,
            gemini_api_key=gemini_key,
            gemini_model=(os.getenv("GEMINI_MODEL") or "gemini-2.5-flash").strip() or "gemini-2.5-flash",
            gemini_base_url=(
                os.getenv("GEMINI_BASE_URL")
                or "https://generativelanguage.googleapis.com/v1beta"
            ).strip(),
            openrouter_api_key=openrouter_key,
            openrouter_model=(
                os.getenv("OPENROUTER_MODEL") or "google/gemini-2.5-flash"
            ).strip()
            or "google/gemini-2.5-flash",
            openrouter_base_url=(
                os.getenv("OPENROUTER_BASE_URL") or "https://openrouter.ai/api/v1"
            ).strip(),
            openrouter_site_url=(
                os.getenv("OPENROUTER_SITE_URL")
                or (
                    f"https://{os.getenv('VERCEL_PROJECT_PRODUCTION_URL') or os.getenv('VERCEL_URL')}"
                    if (os.getenv("VERCEL_PROJECT_PRODUCTION_URL") or os.getenv("VERCEL_URL"))
                    else "http://localhost:5173"
                )
            ).strip(),
            openrouter_app_name=(
                os.getenv("OPENROUTER_APP_NAME") or "Sanchaya AI Engine"
            ).strip(),
            openai_api_key=openai_key,
            openai_model=(os.getenv("OPENAI_MODEL") or "gpt-4o-mini").strip() or "gpt-4o-mini",
            openai_base_url=(os.getenv("OPENAI_BASE_URL") or "").strip() or None,
            internal_api_token=(os.getenv("INTERNAL_API_TOKEN") or "").strip() or None,
            freshness_max_age_days=max_age_days,
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached runtime settings (call ``get_settings.cache_clear()`` in tests)."""
    return Settings.from_env()
