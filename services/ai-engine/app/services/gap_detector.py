"""Module 3 (Stages 3-4): Deterministic Gap Detector."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.models.schemas import EvidenceStatus, FindingCategory, GapCategory
from app.services.evidence_validator import normalize_text


class DetectedGap(BaseModel):
    """Deterministic representation of a knowledge gap requiring outgoing-member input."""

    gap_category: GapCategory
    finding_id: Any = None
    topic: str
    claim: str
    category: FindingCategory
    source_id: str
    verification_status: EvidenceStatus
    conflicting_values: list[str] = Field(default_factory=list)
    conflicting_source_ids: list[str] = Field(default_factory=list)
    context: str = ""


def _is_missing_field(value: Any) -> bool:
    if value is None:
        return True
    if not isinstance(value, str):
        return False
    stripped = value.strip()
    return not stripped or stripped.casefold() in {"unknown", "n/a", "none", "unassigned"}


def detect_gaps(findings: list[dict[str, Any]]) -> list[DetectedGap]:
    """Deterministically flag all 4 Stage 3-4 gap categories across validated findings.

    Categories:
      1. ``conflicting_sources``: findings marked ``Conflicting`` (deduplicated per topic)
      2. ``unknown_claim``: findings marked ``Unknown``
      3. ``missing_owner``: ``task`` findings without an assigned owner
      4. ``missing_rationale``: ``decision`` findings without a documented rationale

    Plain ``Needs review`` findings (with owner/rationale present) are NOT routed to
    the outgoing-member gap loop; they remain for Team Leader review.
    """
    gaps: list[DetectedGap] = []
    seen_conflict_topics: set[str] = set()

    for finding in findings:
        raw_status = finding.get("verification_status", EvidenceStatus.UNKNOWN)
        status = (
            raw_status
            if isinstance(raw_status, EvidenceStatus)
            else EvidenceStatus(str(raw_status))
        )

        raw_category = finding.get("category", FindingCategory.DECISION)
        category = (
            raw_category
            if isinstance(raw_category, FindingCategory)
            else FindingCategory(str(raw_category))
        )

        claim = str(finding.get("claim", "")).strip()
        source_id = str(finding.get("source_id", "")).strip() or "UNKNOWN"
        topic = str(finding.get("topic") or claim).strip()
        finding_id = finding.get("_id") or finding.get("id")

        if status == EvidenceStatus.CONFLICTING:
            norm_topic = normalize_text(topic) or str(finding_id or claim)
            if norm_topic in seen_conflict_topics:
                continue
            seen_conflict_topics.add(norm_topic)

            conflict_details = finding.get("conflict_details") or {}
            versions = conflict_details.get("all_versions") or []
            conflicting_values: list[str] = []
            conflicting_source_ids: list[str] = []

            for ver in versions:
                ver_claim = str(ver.get("claim") or ver.get("verbatim_excerpt") or "").strip()
                ver_src = str(ver.get("source_id") or "").strip()
                if ver_claim and ver_claim not in conflicting_values:
                    conflicting_values.append(ver_claim)
                if ver_src and ver_src not in conflicting_source_ids:
                    conflicting_source_ids.append(ver_src)

            if not conflicting_source_ids:
                conflicting_source_ids = [source_id]
                other_src = finding.get("conflicting_source_id")
                if other_src:
                    conflicting_source_ids.append(str(other_src))

            gaps.append(
                DetectedGap(
                    gap_category=GapCategory.CONFLICTING_SOURCES,
                    finding_id=finding_id,
                    topic=topic,
                    claim=claim,
                    category=category,
                    source_id=source_id,
                    verification_status=status,
                    conflicting_values=conflicting_values,
                    conflicting_source_ids=conflicting_source_ids,
                    context=str(finding.get("explanation") or ""),
                )
            )
            continue

        if status == EvidenceStatus.UNKNOWN:
            gaps.append(
                DetectedGap(
                    gap_category=GapCategory.UNKNOWN_CLAIM,
                    finding_id=finding_id,
                    topic=topic,
                    claim=claim,
                    category=category,
                    source_id=source_id,
                    verification_status=status,
                    context=str(finding.get("explanation") or ""),
                )
            )
            continue

        if category == FindingCategory.TASK and _is_missing_field(finding.get("owner")):
            gaps.append(
                DetectedGap(
                    gap_category=GapCategory.MISSING_OWNER,
                    finding_id=finding_id,
                    topic=topic,
                    claim=claim,
                    category=category,
                    source_id=source_id,
                    verification_status=status,
                    context="Task has no assigned owner.",
                )
            )

        if category == FindingCategory.DECISION and _is_missing_field(finding.get("rationale")):
            gaps.append(
                DetectedGap(
                    gap_category=GapCategory.MISSING_RATIONALE,
                    finding_id=finding_id,
                    topic=topic,
                    claim=claim,
                    category=category,
                    source_id=source_id,
                    verification_status=status,
                    context="Decision lacks a documented rationale.",
                )
            )

    return gaps

