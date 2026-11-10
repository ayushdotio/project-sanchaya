from datetime import datetime
from app.models.schemas import (
    DecisionFact,
    EvidenceStatus,
    EvidenceValidationResult,
)



def detect_conflict(facts: list[DecisionFact]) -> bool:
    superseded_sources = set()

    # Only accept an explicit replacement from a newer record.
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

        except ValueError:
            continue

    decisions_by_topic: dict[str, set[str]] = {}

    for fact in facts:
        if fact.source_id in superseded_sources:
            continue

        topic = fact.topic.strip().casefold()
        value = fact.value.strip().casefold()

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
) -> EvidenceValidationResult:

    # Automatically check structured decision facts.
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

    if evidence_excerpt in source_text:
        return EvidenceValidationResult(
            status=EvidenceStatus.SUPPORTED,
            explanation="Exact evidence excerpt found in the source.",
            source_id=source_id,
        )

    return EvidenceValidationResult(
        status=EvidenceStatus.NEEDS_REVIEW,
        explanation="Evidence excerpt was not found in the source.",
        source_id=source_id,
    )
