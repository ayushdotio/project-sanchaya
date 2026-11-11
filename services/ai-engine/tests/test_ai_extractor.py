import json
import os
import unittest
from unittest.mock import patch

from app.core.config import get_settings
from app.models.schemas import FindingCategory
from app.services.ai_extractor import (
    ExtractionValidationError,
    MissingLLMConfigurationError,
    extract_candidates_from_sources,
    parse_extraction_response,
)


class TestAIExtractor(unittest.TestCase):

    def tearDown(self):
        get_settings.cache_clear()

    def test_parse_valid_json_and_strip_fences(self):
        payload = {
            "findings": [
                {
                    "category": "decision",
                    "claim": "Use stateless JWT authentication",
                    "source_id": "SRC-DOC-001",
                    "verbatim_excerpt": "decided to use stateless JWTs with [REDACTED_SECRET]",
                    "owner": None,
                    "rationale": "Simplifies container scaling",
                    "topic": "authentication",
                }
            ]
        }
        wrapped = f"```json\n{json.dumps(payload)}\n```"
        parsed = parse_extraction_response(wrapped)
        self.assertEqual(len(parsed.findings), 1)
        self.assertEqual(parsed.findings[0].category, FindingCategory.DECISION)
        self.assertIn("[REDACTED_SECRET]", parsed.findings[0].verbatim_excerpt)

    def test_rejects_invalid_json_or_unknown_fields(self):
        with self.assertRaises(ExtractionValidationError):
            parse_extraction_response("not valid json")

        with self.assertRaises(ExtractionValidationError):
            parse_extraction_response('{"findings": [{"category": "invalid_cat", "claim": "x", "source_id": "SRC-1"}]}')

    def test_extract_candidates_batches_and_uses_redacted_content_only(self):
        captured_prompts = []

        def fake_llm(_system_prompt: str, user_prompt: str) -> str:
            captured_prompts.append(user_prompt)
            return json.dumps(
                {
                    "findings": [
                        {
                            "category": "task",
                            "claim": "Wire dead-letter queue for webhook retries",
                            "source_id": "SRC-TSK-001",
                            "verbatim_excerpt": "Wire dead-letter queue for webhook retries",
                            "owner": None,
                            "deadline": None,
                            "topic": "webhooks",
                        }
                    ]
                }
            )

        sources = [
            {
                "source_id": "SRC-TSK-001",
                "source_type": "task",
                "origin": "tasks.csv",
                "raw_filename": "tasks.csv",
                "redacted_content": "Wire dead-letter queue for webhook retries using [REDACTED_SECRET].",
                "raw_content": "SHOULD_NEVER_BE_SENT_RAW_SECRET",
                "updated_at": "2026-11-01T10:00:00Z",
            }
        ]

        candidates = extract_candidates_from_sources(sources, llm_client=fake_llm)
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].source_id, "SRC-TSK-001")
        self.assertIn("[REDACTED_SECRET]", captured_prompts[0])
        self.assertNotIn("SHOULD_NEVER_BE_SENT_RAW_SECRET", captured_prompts[0])

    def test_missing_llm_keys_raises_configuration_error(self):
        get_settings.cache_clear()
        with patch.dict(
            os.environ,
            {
                "GEMINI_API_KEY": "",
                "GOOGLE_API_KEY": "",
                "OPENROUTER_API_KEY": "",
                "OPENAI_API_KEY": "",
            },
            clear=False,
        ):
            get_settings.cache_clear()
            with self.assertRaises(MissingLLMConfigurationError):
                extract_candidates_from_sources(
                    [{"source_id": "SRC-DOC-1", "redacted_content": "Some text."}]
                )


if __name__ == "__main__":
    unittest.main()

