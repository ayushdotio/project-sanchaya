"""Module 2 (Stage 3: Verify): Deterministic Evidence & Conflict Validator."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from app.models.schemas import (
    ConflictDetails,
    ConflictVersion,
    DecisionFact,
    EvidenceStatus,
    EvidenceValidationResult,
    ExtractedFindingCandidate,
    FindingCategory,
)

_STOPWORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "been",
        "by",
        "for",
        "from",
        "has",
        "have",
        "in",
        "is",
        "it",
        "its",
        "of",
        "on",
        "or",
        "our",
        "that",
        "the",
        "their",
        "this",
        "to",
        "use",
        "using",
        "was",
        "we",
        "were",
        "will",
        "with",
        "team",
        "decided",
        "decision",
        "project",
    }
)

_INFORMAL_HINTS = ("chat", "slack", "discord", "informal", "scratch", "dm", "whatsapp")


def normalize_text(text: str) -> str:
    """Normalize text for case-insensitive, whitespace-tolerant matching."""
    return re.sub(r"\s+", " ", text).strip().casefold()


def parse_utc_datetime(value: datetime | str | None) -> datetime | None:
    """Parse a datetime or ISO-8601 string into a UTC-aware ``datetime``."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def contains_negation(text: str) -> bool:
    """Detect explicit negation words, contractions, and negative decision verbs."""
    normalized = normalize_text(text)
    if not normalized:
        return False

    negation_patterns = [
        r"\bnot\b",
        r"\bno\b",
        r"\bnever\b",
        r"\bneither\b",
        r"\bnor\b",
        r"\bwithout\b",
        r"\bcannot\b",
        r"\b\w+n't\b",
        r"\brejected\b",
        r"\bdeprecated\b",
        r"\bremoved\b",
        r"\bcancelled\b",
        r"\bcanceled\b",
        r"\bdeclined\b",
        r"\babandoned\b",
        r"\bdropped\b",
        r"\bavoided\b",
    ]
    return any(re.search(pattern, normalized) for pattern in negation_patterns)


def _content_tokens(text: str) -> set[str]:
    tokens = set(re.findall(r"[a-z0-9_]+", normalize_text(text)))
    return {tok for tok in tokens if len(tok) >= 2 and tok not in _STOPWORDS}


def clause_matches_polarity(claim: str, evidence_excerpt: str) -> bool:
    """Evaluate negation within the clause(s) most relevant to ``claim``."""
    claim_negated = contains_negation(claim)
    clauses = [
        c.strip()
        for c in re.split(r"[.;\n]+|\b(?:but|however|whereas|instead)\b", evidence_excerpt, flags=re.IGNORECASE)
        if c.strip()
    ]
    if len(clauses) <= 1:
        return claim_negated == contains_negation(evidence_excerpt)

    claim_tokens = _content_tokens(claim)
    scored: list[tuple[int, str]] = []
    for clause in clauses:
        overlap = len(claim_tokens & _content_tokens(clause))
        if overlap > 0:
            scored.append((overlap, clause))

    if not scored:
        return claim_negated == contains_negation(evidence_excerpt)

    max_overlap = max(score for score, _ in scored)
    best_clauses = [clause for score, clause in scored if score == max_overlap]
    # All top-matching clauses must agree in polarity with the claim.
    return all(contains_negation(clause) == claim_negated for clause in best_clauses)


def _build_boundary_regex(normalized_excerpt: str) -> str:
    """Build boundary-aware regex only on edges that start/end with word chars."""
    prefix = r"(?<!\w)" if re.match(r"^\w", normalized_excerpt) else ""
    suffix = r"(?!\w)" if re.search(r"\w$", normalized_excerpt) else ""
    return prefix + re.escape(normalized_excerpt) + suffix


def excerpt_matches_source(source_text: str, evidence_excerpt: str) -> tuple[bool, bool]:
    """Return ``(exact_match, partial_match)`` after case/whitespace normalization."""
    normalized_source = normalize_text(source_text)
    normalized_excerpt = normalize_text(evidence_excerpt)
    if not normalized_source or not normalized_excerpt:
        return False, False

    pattern = _build_boundary_regex(normalized_excerpt)
    if re.search(pattern, normalized_source):
        return True, False

    # Partial match: non-boundary substring (e.g. "Mongo" in "MongoDB")
    if normalized_excerpt in normalized_source:
        return False, True

    # Partial match: significant token overlap (>= 50% of content tokens)
    excerpt_tokens = _content_tokens(normalized_excerpt)
    source_tokens = _content_tokens(normalized_source)
    if excerpt_tokens and source_tokens:
        overlap = excerpt_tokens & source_tokens
        ratio = len(overlap) / len(excerpt_tokens)
        min_required = 1 if len(excerpt_tokens) <= 2 else 2
        if len(overlap) >= min_required and ratio >= 0.5:
            return False, True

    return False, False


def _is_informal_source(source_record: dict[str, Any], candidate: ExtractedFindingCandidate | None = None) -> bool:
    if candidate and candidate.is_informal_note:
        return True
    if source_record.get("source_type") != "document":
        return False
    origin = normalize_text(str(source_record.get("origin", "")))
    filename = normalize_text(str(source_record.get("raw_filename", "")))
    combined = f"{origin} {filename}"
    return any(hint in combined for hint in _INFORMAL_HINTS)


def analyze_conflicts(facts: list[DecisionFact]) -> dict[str, ConflictDetails]:
    """Analyze ``DecisionFact`` entries per topic and return structured conflict details.

    Respects explicit ``supersedes_source_id`` when timestamps are valid and newer,
    normalizing all timestamps to UTC to avoid naive/aware ``TypeError``.
    """
    superseded_sources: set[str] = set()

    for newer in facts:
        if not newer.supersedes_source_id:
            continue
        older_records = [f for f in facts if f.source_id == newer.supersedes_source_id]
        if not older_records:
            continue

        newer_dt = parse_utc_datetime(newer.recorded_at)
        if newer_dt is None:
            continue

        older_dts = [parse_utc_datetime(old.recorded_at) for old in older_records]
        if any(dt is None for dt in older_dts):
            continue

        if all(newer_dt > old_dt for old_dt in older_dts if old_dt is not None):
            superseded_sources.add(newer.supersedes_source_id)

    facts_by_topic: dict[str, list[DecisionFact]] = {}
    for fact in facts:
        if fact.source_id in superseded_sources:
            continue
        topic = normalize_text(fact.topic)
        value = normalize_text(fact.value)
        if not topic or not value:
            continue
        facts_by_topic.setdefault(topic, []).append(fact)

    conflicts: dict[str, ConflictDetails] = {}
    for topic, topic_facts in facts_by_topic.items():
        distinct_values = {normalize_text(f.value) for f in topic_facts}
        if len(distinct_values) <= 1:
            continue

        def _sort_key(item: DecisionFact) -> tuple[int, datetime]:
            dt = parse_utc_datetime(item.recorded_at)
            return (0, dt) if dt is not None else (1, datetime.max.replace(tzinfo=timezone.utc))

        sorted_facts = sorted(topic_facts, key=_sort_key)
        versions = [
            ConflictVersion(
                source_id=f.source_id,
                claim=f.value,
                verbatim_excerpt=f.evidence_excerpt,
                recorded_at=f.recorded_at,
                source_type=f.source_type,
                origin=f.origin,
                url=f.url,
            )
            for f in sorted_facts
        ]
        conflicts[topic] = ConflictDetails(
            topic=topic,
            earlier_version=versions[0],
            newer_version=versions[-1],
            all_versions=versions,
        )

    return conflicts


def detect_conflict(facts: list[DecisionFact]) -> bool:
    """Return True if any topic in ``facts`` has an unresolved conflict."""
    return bool(analyze_conflicts(facts))


def _claims_conflict(claim_a: str, claim_b: str) -> bool:
    """Determine if two claims sharing a topic contradict rather than corroborate."""
    norm_a = normalize_text(claim_a)
    norm_b = normalize_text(claim_b)
    if norm_a == norm_b:
        return False

    if contains_negation(claim_a) != contains_negation(claim_b):
        return True

    tokens_a = _content_tokens(claim_a)
    tokens_b = _content_tokens(claim_b)
    if not tokens_a or not tokens_b:
        return norm_a != norm_b

    union = tokens_a | tokens_b
    jaccard = len(tokens_a & tokens_b) / len(union)
    # High token overlap with matching polarity is corroboration/restatement.
    return jaccard < 0.65


def detect_candidate_conflicts(
    candidates: list[ExtractedFindingCandidate],
    source_records_by_id: dict[str, dict[str, Any]],
) -> tuple[dict[str, ConflictDetails], set[str]]:
    """Detect topic-scoped cross-source conflicts across extracted candidates.

    Returns ``(conflict_by_topic, corroborated_topics)``.
    """
    grouped: dict[str, list[tuple[ExtractedFindingCandidate, dict[str, Any] | None]]] = {}
    for candidate in candidates:
        topic = normalize_text(candidate.topic or "")
        if not topic:
            continue
        grouped.setdefault(topic, []).append((candidate, source_records_by_id.get(candidate.source_id)))

    conflicts: dict[str, ConflictDetails] = {}
    corroborated_topics: set[str] = set()

    for topic, items in grouped.items():
        if len(items) < 2:
            continue

        distinct_sources = {cand.source_id for cand, _ in items}
        if len(distinct_sources) < 2:
            continue

        has_non_informal = any(
            rec is not None and not _is_informal_source(rec, cand)
            for cand, rec in items
        )

        # Check pairwise claims across distinct source_ids for contradiction
        contradictory = False
        for idx in range(len(items)):
            for jdx in range(idx + 1, len(items)):
                cand_a, _ = items[idx]
                cand_b, _ = items[jdx]
                if cand_a.source_id != cand_b.source_id and _claims_conflict(cand_a.claim, cand_b.claim):
                    contradictory = True
                    break
            if contradictory:
                break

        if not contradictory:
            if has_non_informal:
                corroborated_topics.add(topic)
            continue

        def _item_sort_key(pair: tuple[ExtractedFindingCandidate, dict[str, Any] | None]) -> tuple[int, datetime]:
            _, rec = pair
            ts = None
            if rec is not None:
                ts = parse_utc_datetime(rec.get("updated_at") or rec.get("created_at") or rec.get("imported_at"))
            return (0, ts) if ts is not None else (1, datetime.max.replace(tzinfo=timezone.utc))

        sorted_items = sorted(items, key=_item_sort_key)
        versions: list[ConflictVersion] = []
        for cand, rec in sorted_items:
            ts_val = None
            url_val = None
            src_type = None
            origin_val = None
            if rec is not None:
                raw_ts = rec.get("updated_at") or rec.get("created_at") or rec.get("imported_at")
                parsed_ts = parse_utc_datetime(raw_ts)
                ts_val = parsed_ts.isoformat() if parsed_ts else (str(raw_ts) if raw_ts else None)
                src_type = rec.get("source_type")
                origin_val = rec.get("origin")
                meta = rec.get("metadata") or {}
                if isinstance(meta, dict):
                    url_val = meta.get("url") or None

            versions.append(
                ConflictVersion(
                    source_id=cand.source_id,
                    claim=cand.claim,
                    verbatim_excerpt=cand.verbatim_excerpt,
                    recorded_at=ts_val,
                    source_type=src_type,
                    origin=origin_val,
                    url=url_val,
                )
            )

        conflicts[topic] = ConflictDetails(
            topic=topic,
            earlier_version=versions[0],
            newer_version=versions[-1],
            all_versions=versions,
        )

    return conflicts, corroborated_topics


def _find_scoped_conflict(
    conflicts: dict[str, ConflictDetails],
    topic: str | None = None,
    source_id: str | None = None,
) -> ConflictDetails | None:
    if not conflicts:
        return None
    if topic:
        norm_topic = normalize_text(topic)
        if norm_topic in conflicts:
            return conflicts[norm_topic]
    if source_id:
        for detail in conflicts.values():
            if any(v.source_id == source_id for v in detail.all_versions):
                return detail
    return None


def validate_evidence(
    source_text: str | None,
    evidence_excerpt: str | None,
    source_id: str | None = None,
    has_conflict: bool = False,
    facts: list[DecisionFact] | None = None,
    claim: str | None = None,
    topic: str | None = None,
    source_records_collection: Any = None,
    project_id: Any = None,
) -> EvidenceValidationResult:
    """Validate an evidence excerpt against ``source_text`` or MongoDB ``source_records``."""
    if source_text is None and source_id and source_records_collection is not None and project_id is not None:
        doc = source_records_collection.find_one({"projectId": project_id, "source_id": source_id})
        if doc:
            source_text = doc.get("redacted_content")

    scoped_conflict: ConflictDetails | None = None
    if facts:
        conflicts_map = analyze_conflicts(facts)
        if topic or source_id:
            scoped_conflict = _find_scoped_conflict(conflicts_map, topic=topic, source_id=source_id)
        elif conflicts_map:
            scoped_conflict = next(iter(conflicts_map.values()))
        if scoped_conflict is not None:
            has_conflict = True

    if has_conflict:
        other_source = None
        if scoped_conflict is not None:
            others = [v.source_id for v in scoped_conflict.all_versions if v.source_id != source_id]
            other_source = others[0] if others else scoped_conflict.newer_version.source_id
        return EvidenceValidationResult(
            status=EvidenceStatus.CONFLICTING,
            explanation="Multiple sources contain contradictory information for this topic.",
            source_id=source_id,
            conflicting_source_id=other_source,
            conflict_details=scoped_conflict,
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

    if claim and not clause_matches_polarity(claim, evidence_excerpt):
        return EvidenceValidationResult(
            status=EvidenceStatus.NEEDS_REVIEW,
            explanation=(
                "The claim and evidence excerpt differ in explicit "
                "negation. Manual verification is required."
            ),
            source_id=source_id,
        )

    exact_match, partial_match = excerpt_matches_source(source_text, evidence_excerpt)
    if exact_match:
        return EvidenceValidationResult(
            status=EvidenceStatus.SUPPORTED,
            explanation=(
                "Evidence excerpt matches the original source "
                "after case and whitespace normalization."
            ),
            source_id=source_id,
        )

    if partial_match:
        return EvidenceValidationResult(
            status=EvidenceStatus.NEEDS_REVIEW,
            explanation=(
                "Evidence excerpt only partially matches the original source. "
                "Manual verification is required."
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


def validate_finding_against_sources(
    candidate: ExtractedFindingCandidate,
    source_records_by_id: dict[str, dict[str, Any]],
    conflict_map: dict[str, ConflictDetails] | None = None,
    corroborated_topics: set[str] | None = None,
    source_records_collection: Any = None,
    project_id: Any = None,
) -> EvidenceValidationResult:
    """Deterministic Stage 3 validation backed by MongoDB ``source_records``."""
    source_record = source_records_by_id.get(candidate.source_id)
    if source_record is None and source_records_collection is not None and project_id is not None:
        source_record = source_records_collection.find_one(
            {"projectId": project_id, "source_id": candidate.source_id}
        )

    if not source_record or not str(source_record.get("redacted_content", "")).strip():
        return EvidenceValidationResult(
            status=EvidenceStatus.UNKNOWN,
            explanation=f"Cited source_id '{candidate.source_id}' was not found in source_records.",
            source_id=candidate.source_id,
        )

    scoped_conflict = _find_scoped_conflict(
        conflict_map or {},
        topic=candidate.topic,
        source_id=candidate.source_id,
    )
    if scoped_conflict is not None:
        others = [v.source_id for v in scoped_conflict.all_versions if v.source_id != candidate.source_id]
        other_source = others[0] if others else scoped_conflict.newer_version.source_id
        return EvidenceValidationResult(
            status=EvidenceStatus.CONFLICTING,
            explanation=(
                f"Sources disagree on topic '{scoped_conflict.topic}': "
                f"{scoped_conflict.earlier_version.source_id} vs {scoped_conflict.newer_version.source_id}."
            ),
            source_id=candidate.source_id,
            conflicting_source_id=other_source,
            conflict_details=scoped_conflict,
        )

    if not candidate.verbatim_excerpt:
        return EvidenceValidationResult(
            status=EvidenceStatus.UNKNOWN,
            explanation="No verbatim supporting excerpt was extracted for this claim.",
            source_id=candidate.source_id,
        )

    redacted_content = str(source_record["redacted_content"])
    exact_match, partial_match = excerpt_matches_source(redacted_content, candidate.verbatim_excerpt)

    if not exact_match:
        if partial_match:
            return EvidenceValidationResult(
                status=EvidenceStatus.NEEDS_REVIEW,
                explanation="Evidence excerpt only partially matches the source record.",
                source_id=candidate.source_id,
            )
        return EvidenceValidationResult(
            status=EvidenceStatus.UNKNOWN,
            explanation="Cited excerpt does not appear in the stored source record.",
            source_id=candidate.source_id,
        )

    if not clause_matches_polarity(candidate.claim, candidate.verbatim_excerpt):
        return EvidenceValidationResult(
            status=EvidenceStatus.NEEDS_REVIEW,
            explanation="Claim polarity disagrees with the matched clause in the source excerpt.",
            source_id=candidate.source_id,
        )

    if candidate.category == FindingCategory.TASK and (not candidate.owner or not candidate.deadline):
        missing_parts = []
        if not candidate.owner:
            missing_parts.append("owner")
        if not candidate.deadline:
            missing_parts.append("deadline")
        return EvidenceValidationResult(
            status=EvidenceStatus.NEEDS_REVIEW,
            explanation=f"Task excerpt is verified, but missing {' and '.join(missing_parts)}.",
            source_id=candidate.source_id,
        )

    norm_topic = normalize_text(candidate.topic or "")
    is_corroborated = bool(norm_topic and corroborated_topics and norm_topic in corroborated_topics)
    if _is_informal_source(source_record, candidate) and not is_corroborated:
        return EvidenceValidationResult(
            status=EvidenceStatus.NEEDS_REVIEW,
            explanation="Claim is backed only by a single informal note without corroboration.",
            source_id=candidate.source_id,
        )

    return EvidenceValidationResult(
        status=EvidenceStatus.SUPPORTED,
        explanation="Verbatim excerpt verified in MongoDB source_records.",
        source_id=candidate.source_id,
    )
