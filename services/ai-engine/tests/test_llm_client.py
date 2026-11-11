import json
import os
import unittest
from unittest.mock import patch

import httpx

from app.core.config import Settings, get_settings
from app.services.llm_client import (
    LLMConfigurationError,
    LLMProviderError,
    build_llm_callable,
    resolve_llm_config,
)


class TestLLMClient(unittest.TestCase):

    def tearDown(self):
        get_settings.cache_clear()

    def test_auto_prefers_openrouter_when_all_keys_present(self):
        settings = Settings(
            openrouter_api_key="sk-or-v1-test123",
            openrouter_model="google/gemini-2.5-flash",
            gemini_api_key="AIzaTestGeminiKey123",
            gemini_model="gemini-2.5-flash",
            openai_api_key="sk-proj-openai123",
        )
        resolved = resolve_llm_config(settings)
        self.assertEqual(resolved.provider, "openrouter")
        self.assertEqual(resolved.model, "google/gemini-2.5-flash")
        self.assertEqual(resolved.base_url, "https://openrouter.ai/api/v1")

    def test_auto_selects_gemini_when_only_gemini_key_present(self):
        settings = Settings(gemini_api_key="AIzaTestGeminiKey123", gemini_model="gemini-2.5-flash")
        resolved = resolve_llm_config(settings)
        self.assertEqual(resolved.provider, "gemini")
        self.assertEqual(resolved.model, "gemini-2.5-flash")

    def test_auto_selects_openrouter_when_openrouter_key_present(self):
        settings = Settings(
            openrouter_api_key="sk-or-v1-test123",
            openrouter_model="google/gemini-2.5-flash",
        )
        resolved = resolve_llm_config(settings)
        self.assertEqual(resolved.provider, "openrouter")
        self.assertEqual(resolved.model, "google/gemini-2.5-flash")
        self.assertEqual(resolved.base_url, "https://openrouter.ai/api/v1")

    def test_prefix_autodetection_for_legacy_openai_key_field(self):
        gemini_like = Settings(openai_api_key="AIzaLegacyDroppedKey")
        self.assertEqual(resolve_llm_config(gemini_like).provider, "gemini")

        openrouter_like = Settings(openai_api_key="sk-or-v1-legacy-key")
        self.assertEqual(resolve_llm_config(openrouter_like).provider, "openrouter")

    def test_explicit_provider_and_llm_model_override(self):
        settings = Settings(
            llm_provider="openrouter",
            llm_model="google/gemini-2.0-flash-001",
            gemini_api_key="AIzaTestGemini",
            openrouter_api_key="sk-or-v1-test",
        )
        resolved = resolve_llm_config(settings)
        self.assertEqual(resolved.provider, "openrouter")
        self.assertEqual(resolved.model, "google/gemini-2.0-flash-001")

    def test_missing_all_keys_raises_configuration_error(self):
        with patch.dict(
            os.environ,
            {"GEMINI_API_KEY": "", "GOOGLE_API_KEY": "", "OPENROUTER_API_KEY": "", "OPENAI_API_KEY": ""},
            clear=False,
        ):
            get_settings.cache_clear()
            with self.assertRaises(LLMConfigurationError):
                resolve_llm_config(Settings())

    def test_gemini_http_request_and_response_parsing(self):
        captured = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            captured["body"] = json.loads(request.content.decode("utf-8"))
            return httpx.Response(
                200,
                json={
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {"text": '{"findings": []}'}
                                ]
                            }
                        }
                    ]
                },
            )

        settings = Settings(
            llm_provider="gemini",
            gemini_api_key="AIzaFakeKey",
            gemini_model="gemini-2.5-flash",
        )
        caller = build_llm_callable(
            settings=settings,
            transport=httpx.MockTransport(handler),
        )
        out = caller("SYS_PROMPT", "USER_PROMPT")
        self.assertEqual(out, '{"findings": []}')
        self.assertIn("/models/gemini-2.5-flash:generateContent", captured["url"])
        self.assertIn("key=AIzaFakeKey", captured["url"])
        self.assertEqual(captured["body"]["generationConfig"]["responseMimeType"], "application/json")
        self.assertEqual(captured["body"]["systemInstruction"]["parts"][0]["text"], "SYS_PROMPT")

    def test_openrouter_http_request_and_response_format_retry(self):
        calls = []

        def handler(request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content.decode("utf-8"))
            calls.append((dict(request.headers), body))
            if "response_format" in body:
                return httpx.Response(400, text="response_format json_object is not supported")
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {"message": {"content": '{"findings": []}'}}
                    ]
                },
            )

        settings = Settings(
            llm_provider="openrouter",
            openrouter_api_key="sk-or-v1-fake",
            openrouter_model="google/gemini-2.5-flash",
        )
        caller = build_llm_callable(
            settings=settings,
            transport=httpx.MockTransport(handler),
        )
        out = caller("SYS_PROMPT", "USER_PROMPT")
        self.assertEqual(out, '{"findings": []}')
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0][0]["authorization"], "Bearer sk-or-v1-fake")
        self.assertEqual(calls[0][1]["model"], "google/gemini-2.5-flash")
        self.assertNotIn("response_format", calls[1][1])

    def test_gemini_http_error_raises_provider_error(self):
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(401, text="API key not valid")

        settings = Settings(llm_provider="gemini", gemini_api_key="AIzaBad")
        caller = build_llm_callable(
            settings=settings,
            transport=httpx.MockTransport(handler),
        )
        with self.assertRaises(LLMProviderError):
            caller("SYS", "USR")


if __name__ == "__main__":
    unittest.main()

