"""Module 1 (Stage 2: Reconstruct): Structured LLM Claim Extraction."""

from __future__ import annotations

import logging
import re
from typing import Any

from pydantic import ValidationError

from app.models.schemas import ExtractedFindingCandidate, ExtractionBatchOutput
from app.services.llm_client import (
    LLMCallable,
    LLMConfigurationError,
    build_llm_callable,
)

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are the Sanchaya Stage 2 Knowledge Extraction Engine.
Your ONLY job is to extract candidate project claims from pre-redacted source records into strict JSON.

RULES (CRITICAL):
1. Use ONLY the provided `redacted_content`. Never invent, extrapolate, or hallucinate facts.
2. Preserve redaction tokens such as [REDACTED_SECRET] and [REDACTED_PII] verbatim; never guess redacted values.
3. For EVERY extracted item, you MUST include:
   - "category": one of "decision", "task", "blocker", "dependency"
   - "claim": concise factual statement of the decision, task, blocker, or dependency
   - "source_id": the exact source_id of the record containing the evidence (e.g. "SRC-GH-001", "SRC-DOC-002", "SRC-TSK-003")
   - "verbatim_excerpt": an EXACT verbatim substring copied directly from that record's redacted_content
4. Optional fields (include ONLY if explicitly stated in the source; otherwise set to null):
   - "owner": person or handle responsible (for tasks/decisions)
   - "deadline": explicit due date or milestone
   - "rationale": explicit reason/justification for a decision
   - "topic": short normalized topic label (e.g. "authentication", "database", "deployment") used to group related claims across sources
   - "is_informal_note": boolean, true ONLY if the record is an informal chat/scratchpad note
5. Never invent missing owners, deadlines, or rationales. Leave them null if not explicitly present.
6. Return ONLY a JSON object matching: {"findings": [ ... ]}. No markdown fences or commentary.
"""


class ExtractionError(RuntimeError):
    """Base error for Stage 2 extraction failures."""


class MissingLLMConfigurationError(LLMConfigurationError, ExtractionError):
    """Raised when no LLM API key is configured and no custom client was provided."""


class ExtractionValidationError(ExtractionError):
    """Raised when LLM output fails strict Pydantic JSON schema validation."""


def _strip_json_fences(raw_text: str) -> str:
    """Remove optional ```json ... ``` wrappers while keeping JSON content intact."""
    stripped = raw_text.strip()
    fence_match = re.match(r"^```(?:json)?\s*\n?(.*?)\n?```$", stripped, flags=re.DOTALL | re.IGNORECASE)
    if fence_match:
        return fence_match.group(1).strip()
    return stripped


def build_openai_callable() -> LLMCallable:
    """Construct the configured LLM callable (Gemini, OpenRouter, or OpenAI)."""
    try:
        return build_llm_callable(temperature=0.0)
    except LLMConfigurationError as exc:
        raise MissingLLMConfigurationError(str(exc)) from exc


def _format_source_batch_prompt(records: list[dict[str, Any]]) -> str:
    """Render normalized source_records into a structured prompt payload."""
    sections: list[str] = []
    for record in records:
        source_id = str(record.get("source_id", "")).strip()
        source_type = str(record.get("source_type", "unknown"))
        origin = str(record.get("origin", ""))
        filename = str(record.get("raw_filename", ""))
        updated_at = str(record.get("updated_at") or record.get("created_at") or "")
        redacted_content = str(record.get("redacted_content", ""))
        if not source_id or not redacted_content.strip():
            continue

        sections.append(
            f"--- SOURCE RECORD ---\n"
            f"source_id: {source_id}\n"
            f"source_type: {source_type}\n"
            f"origin: {origin}\n"
            f"raw_filename: {filename}\n"
            f"updated_at: {updated_at}\n"
            f"redacted_content:\n{redacted_content}\n"
        )

    return (
        "Extract all decisions, tasks, blockers, and dependencies from the following "
        "pre-redacted source records. Return strict JSON matching {\"findings\": [...]}.\n\n"
        + "\n".join(sections)
    )


def _chunk_source_records(
    records: list[dict[str, Any]],
    max_chars_per_batch: int = 24000,
) -> list[list[dict[str, Any]]]:
    """Group source_records into character-bounded batches for LLM calls."""
    batches: list[list[dict[str, Any]]] = []
    current_batch: list[dict[str, Any]] = []
    current_chars = 0

    for record in records:
        content = str(record.get("redacted_content", ""))
        if not content.strip():
            continue
        rec_len = len(content) + 250
        if current_batch and current_chars + rec_len > max_chars_per_batch:
            batches.append(current_batch)
            current_batch = []
            current_chars = 0
        current_batch.append(record)
        current_chars += rec_len

    if current_batch:
        batches.append(current_batch)

    return batches


def parse_extraction_response(raw_response: str) -> ExtractionBatchOutput:
    """Strictly validate raw LLM JSON output against ExtractionBatchOutput."""
    cleaned = _strip_json_fences(raw_response)
    try:
        return ExtractionBatchOutput.model_validate_json(cleaned)
    except ValidationError as exc:
        raise ExtractionValidationError(
            f"LLM extraction output failed Pydantic schema validation: {exc}"
        ) from exc


def extract_candidates_from_sources(
    source_records: list[dict[str, Any]],
    llm_client: LLMCallable | None = None,
    max_chars_per_batch: int = 24000,
) -> list[ExtractedFindingCandidate]:
    """Run Stage 2 structured extraction across normalized ``source_records``.

    Parameters
    ----------
    source_records:
        Pre-redacted MongoDB ``source_records`` documents for a single project.
    llm_client:
        Optional callable ``(system_prompt, user_prompt) -> raw_json_str`` for testing
        or custom providers. When omitted, uses OpenAI configured via env.
    """
    batches = _chunk_source_records(source_records, max_chars_per_batch=max_chars_per_batch)
    if not batches:
        return []

    call_llm = llm_client or build_openai_callable()
    all_candidates: list[ExtractedFindingCandidate] = []

    for batch in batches:
        user_prompt = _format_source_batch_prompt(batch)
        raw_output = call_llm(SYSTEM_PROMPT, user_prompt)
        parsed = parse_extraction_response(raw_output)
        all_candidates.extend(parsed.findings)

    return all_candidates

