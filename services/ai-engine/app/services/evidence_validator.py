
import re
from datetime import datetime

from app.models.schemas import (
    DecisionFact,
    EvidenceStatus,
    EvidenceValidationResult,
)


def normalize_text(text: str) -> str:
    """Normalize text for case-insensitive, whitespace-tolerant matching."""
    return re.sub(r"\s+", " ", text).strip().casefold()


def contains_negation(text: str) -> bool:
    """Detect common explicit negation phrases."""
    normalized = normalize_text(text)

    negation_patterns = [
        r"\bnot\b",
        r"\bno\b",
        r"\bnever\b",
        r"\bneither\b",
        r"\bwithout\b",
        r"\bhasn't\b",
        r"\bhaven't\b",
        r"\bhadn't\b",
        r"\bdoesn't\b",
        r"\bdon't\b",
        r"\bdidn't\b",
        r"\bwasn't\b",
        r"\bweren't\b",
        r"\bcan't\b",
        r"\bcannot\b",
        r"\bwon't\b",
    ]

    return any(
        re.search(pattern, normalized)
        for pattern in negation_patterns
    )


def detect_conflict(facts: list[DecisionFact]) -> bool:
    superseded_sources = set()

    for newer in facts:
        if not newer.supersedes_source_id:
            continue

        older_records = [
            fact for fact in facts
            if fact.source_id == newer.supersedes_source_id
        ]

        if not older_records:
            continue

        try:
            newer_date = datetime.fromisoformat(newer.recorded_at)

            if all(
                newer_date > datetime.fromisoformat(old.recorded_at)
                for old in older_records
            ):
                superseded_sources.add(newer.supersedes_source_id)

        except (ValueError, TypeError):
            continue

    decisions_by_topic: dict[str, set[str]] = {}

    for fact in facts:
        if fact.source_id in superseded_sources:
            continue

        topic = normalize_text(fact.topic)
        value = normalize_text(fact.value)

        if not topic or not value:
            continue

        decisions_by_topic.setdefault(topic, set()).add(value)

    return any(
        len(values) > 1
        for values in decisions_by_topic.values()
    )


def validate_evidence(
    source_text: str | None,
    evidence_excerpt: str | None,
    source_id: str | None = None,
    has_conflict: bool = False,
    facts: list[DecisionFact] | None = None,
    claim: str | None = None,
) -> EvidenceValidationResult:

    if facts and detect_conflict(facts):
        has_conflict = True

    if has_conflict:
        return EvidenceValidationResult(
            status=EvidenceStatus.CONFLICTING,
            explanation="Multiple sources contain contradictory information.",
            source_id=source_id,
        )

    if not source_text:
        return EvidenceValidationResult(
            status=EvidenceStatus.UNKNOWN,
            explanation="No original source text is available.",
            source_id=source_id,
        )

    if not evidence_excerpt:
        return EvidenceValidationResult(
            status=EvidenceStatus.NEEDS_REVIEW,
            explanation="Evidence excerpt is missing.",
            source_id=source_id,
        )

    # Check whether the claim and evidence disagree on explicit negation.
    if claim:
        claim_is_negated = contains_negation(claim)
        excerpt_is_negated = contains_negation(evidence_excerpt)

        if claim_is_negated != excerpt_is_negated:
            return EvidenceValidationResult(
                status=EvidenceStatus.NEEDS_REVIEW,
                explanation=(
                    "The claim and evidence excerpt differ in explicit "
                    "negation. Manual verification is required."
                ),
                source_id=source_id,
            )

    normalized_source = normalize_text(source_text)
    normalized_excerpt = normalize_text(evidence_excerpt)

    if normalized_excerpt and re.search(
        r"(?<!\w)" + re.escape(normalized_excerpt) + r"(?!\w)",
        normalized_source,
    ):
        return EvidenceValidationResult(
            status=EvidenceStatus.SUPPORTED,
            explanation=(
                "Evidence excerpt matches the original source "
                "after case and whitespace normalization."
            ),
            source_id=source_id,
        )

    return EvidenceValidationResult(
        status=EvidenceStatus.NEEDS_REVIEW,
        explanation=(
            "Evidence excerpt could not be matched to the original source. "
            "Manual verification is required."
        ),
        source_id=source_id,
    )
