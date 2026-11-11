"""Unified multi-provider LLM client supporting Gemini, OpenRouter, and OpenAI."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Literal

import httpx

from app.core.config import Settings, get_settings

LLMCallable = Callable[[str, str], str]
ResolvedProvider = Literal["gemini", "openrouter", "openai"]


class LLMConfigurationError(RuntimeError):
    """Raised when no valid LLM provider credentials are configured."""


class LLMProviderError(RuntimeError):
    """Raised when the upstream LLM provider request fails or returns invalid data."""


@dataclass(frozen=True)
class ResolvedLLMConfig:
    provider: ResolvedProvider
    api_key: str
    model: str
    base_url: str


def resolve_llm_config(settings: Settings | None = None) -> ResolvedLLMConfig:
    """Resolve the active LLM provider, API key, model, and base URL.

    Priority when ``LLM_PROVIDER=auto``:
      1. ``OPENROUTER_API_KEY`` -> ``openrouter`` (preferred when multiple keys are present)
      2. ``GEMINI_API_KEY`` / ``GOOGLE_API_KEY`` -> ``gemini``
      3. ``OPENAI_API_KEY`` (with prefix auto-detection for ``sk-or-...`` / ``AIza...``)
    """
    cfg = settings or get_settings()
    explicit = cfg.llm_provider

    if explicit == "gemini":
        key = cfg.gemini_api_key or (
            cfg.openai_api_key if cfg.openai_api_key and cfg.openai_api_key.startswith("AIza") else None
        )
        if not key:
            raise LLMConfigurationError(
                "LLM_PROVIDER=gemini is set, but GEMINI_API_KEY is not configured."
            )
        return ResolvedLLMConfig(
            provider="gemini",
            api_key=key,
            model=cfg.llm_model or cfg.gemini_model,
            base_url=cfg.gemini_base_url.rstrip("/"),
        )

    if explicit == "openrouter":
        key = cfg.openrouter_api_key or (
            cfg.openai_api_key if cfg.openai_api_key and cfg.openai_api_key.startswith("sk-or-") else None
        )
        if not key:
            raise LLMConfigurationError(
                "LLM_PROVIDER=openrouter is set, but OPENROUTER_API_KEY is not configured."
            )
        return ResolvedLLMConfig(
            provider="openrouter",
            api_key=key,
            model=cfg.llm_model or cfg.openrouter_model,
            base_url=cfg.openrouter_base_url.rstrip("/"),
        )

    if explicit == "openai":
        if not cfg.openai_api_key:
            raise LLMConfigurationError(
                "LLM_PROVIDER=openai is set, but OPENAI_API_KEY is not configured."
            )
        return ResolvedLLMConfig(
            provider="openai",
            api_key=cfg.openai_api_key,
            model=cfg.llm_model or cfg.openai_model,
            base_url=(cfg.openai_base_url or "https://api.openai.com/v1").rstrip("/"),
        )

    # Auto-detection (prefer OpenRouter when configured)
    if cfg.openrouter_api_key:
        return ResolvedLLMConfig(
            provider="openrouter",
            api_key=cfg.openrouter_api_key,
            model=cfg.llm_model or cfg.openrouter_model,
            base_url=cfg.openrouter_base_url.rstrip("/"),
        )

    if cfg.gemini_api_key:
        return ResolvedLLMConfig(
            provider="gemini",
            api_key=cfg.gemini_api_key,
            model=cfg.llm_model or cfg.gemini_model,
            base_url=cfg.gemini_base_url.rstrip("/"),
        )

    if cfg.openai_api_key:
        if cfg.openai_api_key.startswith("AIza") and not cfg.openai_base_url:
            return ResolvedLLMConfig(
                provider="gemini",
                api_key=cfg.openai_api_key,
                model=cfg.llm_model or cfg.gemini_model,
                base_url=cfg.gemini_base_url.rstrip("/"),
            )
        if cfg.openai_api_key.startswith("sk-or-") and not cfg.openai_base_url:
            return ResolvedLLMConfig(
                provider="openrouter",
                api_key=cfg.openai_api_key,
                model=cfg.llm_model or cfg.openrouter_model,
                base_url=cfg.openrouter_base_url.rstrip("/"),
            )
        return ResolvedLLMConfig(
            provider="openai",
            api_key=cfg.openai_api_key,
            model=cfg.llm_model or cfg.openai_model,
            base_url=(cfg.openai_base_url or "https://api.openai.com/v1").rstrip("/"),
        )

    raise LLMConfigurationError(
        "No LLM API key configured. Set GEMINI_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY in root .env."
    )


def _call_gemini(
    resolved: ResolvedLLMConfig,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    timeout: float,
    transport: httpx.BaseTransport | None = None,
) -> str:
    url = f"{resolved.base_url}/models/{resolved.model}:generateContent"
    payload: dict[str, Any] = {
        "systemInstruction": {"parts": [{"text": system_prompt}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "temperature": temperature,
            "responseMimeType": "application/json",
        },
    }

    with httpx.Client(timeout=timeout, transport=transport) as client:
        response = client.post(url, params={"key": resolved.api_key}, json=payload)

    if response.status_code >= 400:
        raise LLMProviderError(
            f"Gemini API error ({response.status_code}): {response.text[:400]}"
        )

    data = response.json()
    candidates = data.get("candidates") or []
    if not candidates:
        raise LLMProviderError(f"Gemini returned no candidates: {data}")

    parts = (candidates[0].get("content") or {}).get("parts") or []
    text = "".join(str(p.get("text", "")) for p in parts if isinstance(p, dict)).strip()
    if not text:
        raise LLMProviderError("Gemini returned an empty response body.")
    return text


def _call_openai_compatible(
    resolved: ResolvedLLMConfig,
    settings: Settings,
    system_prompt: str,
    user_prompt: str,
    temperature: float,
    timeout: float,
    transport: httpx.BaseTransport | None = None,
) -> str:
    url = f"{resolved.base_url}/chat/completions"
    headers: dict[str, str] = {
        "Authorization": f"Bearer {resolved.api_key}",
        "Content-Type": "application/json",
    }
    if resolved.provider == "openrouter":
        if settings.openrouter_site_url:
            headers["HTTP-Referer"] = settings.openrouter_site_url
        if settings.openrouter_app_name:
            headers["X-Title"] = settings.openrouter_app_name

    base_payload: dict[str, Any] = {
        "model": resolved.model,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }

    payload_with_json_mode = {**base_payload, "response_format": {"type": "json_object"}}

    with httpx.Client(timeout=timeout, transport=transport) as client:
        response = client.post(url, headers=headers, json=payload_with_json_mode)
        # Some OpenRouter models reject response_format=json_object with 400; retry with prompt-only JSON.
        if (
            response.status_code == 400
            and resolved.provider == "openrouter"
            and "response_format" in response.text.lower()
        ):
            response = client.post(url, headers=headers, json=base_payload)

    if response.status_code >= 400:
        raise LLMProviderError(
            f"{resolved.provider} API error ({response.status_code}): {response.text[:400]}"
        )

    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        raise LLMProviderError(f"{resolved.provider} returned no choices: {data}")

    content = (choices[0].get("message") or {}).get("content")
    if isinstance(content, list):
        content = "".join(
            str(part.get("text", "")) for part in content if isinstance(part, dict)
        )
    if not content or not str(content).strip():
        raise LLMProviderError(f"{resolved.provider} returned an empty response.")
    return str(content).strip()


def build_llm_callable(
    temperature: float = 0.0,
    timeout: float = 60.0,
    settings: Settings | None = None,
    transport: httpx.BaseTransport | None = None,
) -> LLMCallable:
    """Build a synchronous ``(system_prompt, user_prompt) -> str`` LLM caller."""
    cfg = settings or get_settings()
    resolved = resolve_llm_config(cfg)

    def _call(system_prompt: str, user_prompt: str) -> str:
        if resolved.provider == "gemini":
            return _call_gemini(
                resolved=resolved,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=temperature,
                timeout=timeout,
                transport=transport,
            )
        return _call_openai_compatible(
            resolved=resolved,
            settings=cfg,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=temperature,
            timeout=timeout,
            transport=transport,
        )

    return _call

