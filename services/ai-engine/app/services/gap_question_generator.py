"""Module 4 (Stage 4: Review): LLM-Phrased Gap Question Generator & Persistence."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from app.models.schemas import (
    EvidenceStatus,
    FindingCategory,
    GapCategory,
    GapQuestionStatus,
)
from app.services.gap_detector import DetectedGap
from app.services.llm_client import (
    LLMCallable,
    LLMConfigurationError,
    build_llm_callable,
)

logger = logging.getLogger(__name__)

LLMQuestionCallable = LLMCallable

QUESTION_SYSTEM_PROMPT = """You are the Sanchaya Stage 4 Handover Question Assistant.
Given a deterministically detected knowledge gap, write ONE concise, neutral,
actionable follow-up question addressed to the outgoing team member.

RULES:
1. Ground the question strictly in the provided claim, source IDs, and gap category.
2. Do not invent facts, owners, or answers.
3. Return strict JSON: {"question": "<single concise question ending with ?>"}.
"""


class _PhrasedQuestionOutput(BaseModel):
    question: str = Field(min_length=5, max_length=1000)


def _build_openai_question_callable() -> LLMQuestionCallable | None:
    try:
        return build_llm_callable(temperature=0.2)
    except LLMConfigurationError:
        return None


def _fallback_question_template(gap: DetectedGap) -> str:
    """Deterministic fallback question when LLM is unavailable or errors."""
    if gap.gap_category == GapCategory.MISSING_OWNER:
        return (
            f"Task '{gap.claim}' (from {gap.source_id}) has no assigned owner. "
            "Who is responsible for this task, and what is its current status?"
        )

    if gap.gap_category == GapCategory.MISSING_RATIONALE:
        return (
            f"Decision '{gap.claim}' (from {gap.source_id}) has no documented rationale. "
            "Why was this approach chosen, and were any constraints or alternatives noted?"
        )

    if gap.gap_category == GapCategory.CONFLICTING_SOURCES:
        sources = ", ".join(gap.conflicting_source_ids) if gap.conflicting_source_ids else gap.source_id
        if len(gap.conflicting_values) >= 2:
            options = " vs. ".join(f"'{v}'" for v in gap.conflicting_values[:3])
            return (
                f"Sources ({sources}) disagree regarding {gap.topic}: {options}. "
                "Which version reflects the current state, and why did it change?"
            )
        return (
            f"Sources ({sources}) contain conflicting statements about {gap.topic}. "
            "Which decision is currently active, and what prompted the discrepancy?"
        )

    # GapCategory.UNKNOWN_CLAIM
    return (
        f"Claim '{gap.claim}' (citing {gap.source_id}) could not be verified in project sources. "
        "What is the current status and where is the supporting context documented?"
    )


def phrase_gap_question(
    gap: DetectedGap,
    llm_client: LLMQuestionCallable | None = None,
) -> str:
    """Use the LLM strictly to phrase a focused question for a ``DetectedGap``.

    Falls back to a deterministic template if the LLM key is missing or fails.
    """
    caller = llm_client if llm_client is not None else _build_openai_question_callable()
    if caller is None:
        return _fallback_question_template(gap)

    user_prompt = (
        f"gap_category: {gap.gap_category.value}\n"
        f"topic: {gap.topic}\n"
        f"claim: {gap.claim}\n"
        f"source_id: {gap.source_id}\n"
        f"conflicting_source_ids: {gap.conflicting_source_ids}\n"
        f"conflicting_values: {gap.conflicting_values}\n"
        f"context: {gap.context}\n"
    )

    try:
        raw_response = caller(QUESTION_SYSTEM_PROMPT, user_prompt)
        parsed = _PhrasedQuestionOutput.model_validate_json(raw_response.strip())
        return parsed.question.strip()
    except (ValidationError, Exception) as exc:
        logger.warning("LLM question phrasing failed; using deterministic fallback: %s", exc)
        return _fallback_question_template(gap)


def generate_gap_question(
    topic: str,
    status: EvidenceStatus,
    conflicting_values: list[str] | None = None,
    llm_client: LLMQuestionCallable | None = None,
) -> str | None:
    """Generate a single follow-up question for ``Unknown`` or ``Conflicting`` evidence.

    Returns ``None`` for ``Supported`` and ``Needs review`` (Team Leader review only).
    """
    cleaned_topic = topic.strip()
    if not cleaned_topic:
        return None

    if status not in (EvidenceStatus.UNKNOWN, EvidenceStatus.CONFLICTING):
        return None

    gap_category = (
        GapCategory.CONFLICTING_SOURCES
        if status == EvidenceStatus.CONFLICTING
        else GapCategory.UNKNOWN_CLAIM
    )
    synthetic_gap = DetectedGap(
        gap_category=gap_category,
        topic=cleaned_topic,
        claim=cleaned_topic,
        category=FindingCategory.DECISION,
        source_id="project-sources",
        verification_status=status,
        conflicting_values=conflicting_values or [],
    )
    return phrase_gap_question(synthetic_gap, llm_client=llm_client)


def persist_gap_questions(
    project_id: Any,
    gaps: list[DetectedGap],
    gap_questions_collection: Any,
    llm_client: LLMQuestionCallable | None = None,
) -> list[dict[str, Any]]:
    """Phrase and insert ``GapQuestion`` documents into ``gap_questions``."""
    if not gaps:
        return []

    now = datetime.now(timezone.utc)
    existing_pending = list(
        gap_questions_collection.find(
            {"projectId": project_id, "status": GapQuestionStatus.PENDING.value},
            {"relatedFindingId": 1, "question": 1, "gap_category": 1},
        )
    )
    existing_keys = {
        (str(doc.get("relatedFindingId") or ""), str(doc.get("gap_category") or ""))
        for doc in existing_pending
    }
    existing_questions = {str(doc.get("question") or "").strip() for doc in existing_pending}

    docs_to_insert: list[dict[str, Any]] = []
    for gap in gaps:
        dedup_key = (str(gap.finding_id or ""), gap.gap_category.value)
        if gap.finding_id is not None and dedup_key in existing_keys:
            continue

        question_text = phrase_gap_question(gap, llm_client=llm_client)
        if question_text in existing_questions:
            continue

        doc: dict[str, Any] = {
            "projectId": project_id,
            "relatedFindingId": gap.finding_id,
            "question": question_text,
            "status": GapQuestionStatus.PENDING.value,
            "answer": "",
            "answeredBy": None,
            "answeredAt": None,
            "evidence_badge": "Self-reported",
            "gap_category": gap.gap_category.value,
            "createdAt": now,
            "updatedAt": now,
        }
        docs_to_insert.append(doc)
        existing_keys.add(dedup_key)
        existing_questions.add(question_text)

    if docs_to_insert:
        result = gap_questions_collection.insert_many(docs_to_insert)
        for doc, inserted_id in zip(docs_to_insert, result.inserted_ids):
            doc["_id"] = inserted_id

    return docs_to_insert
