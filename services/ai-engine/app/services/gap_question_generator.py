
from app.models.schemas import EvidenceStatus


def generate_gap_question(
    topic: str,
    status: EvidenceStatus,
    conflicting_values: list[str] | None = None,
) -> str | None:

    topic = topic.strip()

    if not topic:
        return None

    if status == EvidenceStatus.UNKNOWN:
        return f"What is the current decision regarding {topic}?"

    if status == EvidenceStatus.NEEDS_REVIEW:
        return f"Can you clarify the available information about {topic}?"

    if status == EvidenceStatus.CONFLICTING:
        values = conflicting_values or []

        if len(values) >= 2:
            options = " and ".join(values)
            return (
                f"Sources disagree about {topic}: {options}. "
                f"Which decision is currently correct, and why?"
            )

        return (
            f"Sources disagree about {topic}. "
            "Which decision is currently correct, and why?"
        )

    # Supported evidence does not need a follow-up question.
    return None
