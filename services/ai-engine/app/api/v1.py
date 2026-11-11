"""Versioned v1 endpoints for verification, freshness scanning, and question phrasing."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pymongo.errors import PyMongoError

from app.core.ids import parse_object_id
from app.database import get_findings_collection, get_source_records_collection
from app.models.schemas import (
    EvidenceValidationRequest,
    FreshnessCheckRequest,
    FreshnessScanRequest,
    GapQuestionRequest,
)
from app.services.evidence_validator import validate_evidence
from app.services.freshness_monitor import is_evidence_stale, scan_evidence_freshness
from app.services.gap_question_generator import generate_gap_question

router = APIRouter(prefix="/api/v1", tags=["v1"])


@router.post("/evidence/validate")
def evidence_validation(request: EvidenceValidationRequest):
    project_oid = None
    source_records_col = None
    if request.projectId:
        try:
            project_oid = parse_object_id(request.projectId)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if request.source_text is None:
            source_records_col = get_source_records_collection()

    return validate_evidence(
        source_text=request.source_text,
        evidence_excerpt=request.evidence_excerpt,
        source_id=request.source_id,
        facts=request.facts,
        claim=request.claim,
        topic=request.topic,
        source_records_collection=source_records_col,
        project_id=project_oid,
    )


@router.post("/questions/generate")
def generate_question(request: GapQuestionRequest):
    question = generate_gap_question(
        topic=request.topic,
        status=request.status,
        conflicting_values=request.conflicting_values,
    )
    return {"question": question}


@router.post("/evidence/freshness")
def check_evidence_freshness(request: FreshnessCheckRequest):
    try:
        stale = is_evidence_stale(
            recorded_at=request.recorded_at,
            max_age_days=request.max_age_days,
        )
        return {
            "recorded_at": request.recorded_at,
            "max_age_days": request.max_age_days,
            "is_stale": stale,
            "status": "needs_review" if stale else "current",
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/evidence/freshness/scan")
def scan_project_evidence_freshness(request: FreshnessScanRequest):
    try:
        project_oid = parse_object_id(request.projectId)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    try:
        collection = get_findings_collection()
        return scan_evidence_freshness(
            collection=collection,
            max_age_days=request.max_age_days,
            limit=request.limit,
            project_id=project_oid,
        )
    except (PyMongoError, RuntimeError) as exc:
        raise HTTPException(
            status_code=503,
            detail="Could not scan evidence freshness in MongoDB",
        ) from exc

