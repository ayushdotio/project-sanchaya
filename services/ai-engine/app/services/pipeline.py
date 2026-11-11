"""End-to-end Stage 2 -> Stage 3 -> Stage 4 extraction & verification pipeline."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.config import get_settings
from app.core.ids import parse_object_id
from app.database import (
    get_database,
    get_findings_collection,
    get_gap_questions_collection,
    get_source_records_collection,
)
from app.models.schemas import (
    EvidenceOrigin,
    EvidenceStatus,
    ExtractAndVerifyResponse,
    GapQuestionStatus,
    ReviewStatus,
)
from app.services.ai_extractor import LLMCallable, extract_candidates_from_sources
from app.services.evidence_validator import (
    detect_candidate_conflicts,
    validate_finding_against_sources,
)
from app.services.freshness_monitor import (
    evaluate_finding_freshness,
    get_latest_project_activity,
)
from app.services.gap_detector import detect_gaps
from app.services.gap_question_generator import (
    LLMQuestionCallable,
    persist_gap_questions,
)


def run_extract_and_verify(
    project_id_str: str,
    db: Any = None,
    extractor_llm_client: LLMCallable | None = None,
    question_llm_client: LLMQuestionCallable | None = None,
    source_records_override: list[dict[str, Any]] | None = None,
    database_name: str | None = None,
) -> ExtractAndVerifyResponse:
    """Execute Stage 2 extraction, Stage 3 verification & freshness, and Stage 4 gap generation."""
    project_oid = parse_object_id(project_id_str)
    target_db = db if db is not None else get_database(database_name=database_name)
    settings = get_settings()

    source_records_col = get_source_records_collection(target_db)
    findings_col = get_findings_collection(target_db)
    gap_questions_col = get_gap_questions_collection(target_db)

    if source_records_override is not None:
        source_records = list(source_records_override)
    else:
        source_records = list(
            source_records_col.find({"projectId": {"$in": [project_oid, project_id_str]}})
        )
    if not source_records:
        return ExtractAndVerifyResponse(
            success=True,
            message="No source records found for project.",
            findingsCount=0,
            supportedCount=0,
            gapsGenerated=0,
        )

    source_records_by_id = {
        str(rec["source_id"]): rec for rec in source_records if rec.get("source_id")
    }

    # Module 1 (Stage 2): Structured LLM extraction from redacted_content
    candidates = extract_candidates_from_sources(
        source_records=source_records,
        llm_client=extractor_llm_client,
    )

    if not candidates:
        return ExtractAndVerifyResponse(
            success=True,
            message="Extraction completed with 0 candidate findings.",
            findingsCount=0,
            supportedCount=0,
            gapsGenerated=0,
        )

    # Module 2 (Stage 3): Deterministic validation, conflict detection & freshness
    conflict_map, corroborated_topics = detect_candidate_conflicts(
        candidates, source_records_by_id
    )
    latest_activity_at = get_latest_project_activity(source_records)
    now = datetime.now(timezone.utc)

    finding_docs: list[dict[str, Any]] = []
    supported_count = 0

    for candidate in candidates:
        source_record = source_records_by_id.get(candidate.source_id)
        validation = validate_finding_against_sources(
            candidate=candidate,
            source_records_by_id=source_records_by_id,
            conflict_map=conflict_map,
            corroborated_topics=corroborated_topics,
        )
        freshness = evaluate_finding_freshness(
            source_record=source_record,
            latest_project_activity_at=latest_activity_at,
            max_age_days=settings.freshness_max_age_days,
        )

        if validation.status == EvidenceStatus.SUPPORTED:
            supported_count += 1

        doc: dict[str, Any] = {
            "projectId": project_oid,
            "claim": candidate.claim,
            "category": candidate.category.value,
            "source_id": candidate.source_id or "UNKNOWN",
            "verbatim_excerpt": candidate.verbatim_excerpt or "No supporting excerpt found.",
            "verification_status": validation.status.value,
            "evidence_origin": EvidenceOrigin.SYSTEM.value,
            "review_status": ReviewStatus.PENDING.value,
            "owner": candidate.owner,
            "deadline": candidate.deadline,
            "rationale": candidate.rationale,
            "topic": candidate.topic,
            "conflicting_source_id": validation.conflicting_source_id,
            "conflict_details": (
                validation.conflict_details.model_dump()
                if validation.conflict_details is not None
                else None
            ),
            "freshness": freshness.model_dump(),
            "explanation": validation.explanation,
            "reviewedBy": None,
            "reviewedAt": None,
            "createdAt": now,
            "updatedAt": now,
        }
        finding_docs.append(doc)

    # Replace prior unreviewed system pending findings (preserve reviewed/self-reported records)
    prior_pending_ids = [
        doc["_id"]
        for doc in findings_col.find(
            {
                "projectId": project_oid,
                "evidence_origin": EvidenceOrigin.SYSTEM.value,
                "review_status": ReviewStatus.PENDING.value,
            },
            {"_id": 1},
        )
    ]
    if prior_pending_ids:
        gap_questions_col.delete_many(
            {
                "projectId": project_oid,
                "status": GapQuestionStatus.PENDING.value,
                "relatedFindingId": {"$in": prior_pending_ids},
            }
        )
        findings_col.delete_many({"_id": {"$in": prior_pending_ids}})

    insert_result = findings_col.insert_many(finding_docs)
    for doc, inserted_id in zip(finding_docs, insert_result.inserted_ids):
        doc["_id"] = inserted_id

    # Module 3 & 4 (Stage 3-4): Deterministic gap detection & LLM-phrased questions
    gaps = detect_gaps(finding_docs)
    inserted_questions = persist_gap_questions(
        project_id=project_oid,
        gaps=gaps,
        gap_questions_collection=gap_questions_col,
        llm_client=question_llm_client,
    )

    return ExtractAndVerifyResponse(
        success=True,
        message="AI extraction, deterministic verification, and gap detection completed.",
        findingsCount=len(finding_docs),
        supportedCount=supported_count,
        gapsGenerated=len(inserted_questions),
    )

