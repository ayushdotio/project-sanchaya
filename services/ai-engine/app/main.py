
import re

from fastapi import FastAPI, HTTPException, Query
from pymongo.errors import PyMongoError

from app.database import evidence_collection, check_mongodb_connection
from app.models.schemas import (
    EvidenceValidationRequest,
    GapQuestionRequest,
    SelfReportedEvidence,
    FreshnessCheckRequest,
)
from app.services.evidence_validator import validate_evidence
from app.services.gap_question_generator import generate_gap_question
from app.services.freshness_monitor import (
    is_evidence_stale,
    scan_evidence_freshness,
)


app = FastAPI(
    title="Sanchaya AI Engine",
    description="AI-powered knowledge extraction and evidence validation service.",
    version="0.4.0"
)


@app.get("/")
def home():
    return {
        "message": "Welcome to Sanchaya AI Engine",
        "status": "running"
    }


@app.get("/health")
def health_check():
    try:
        check_mongodb_connection()
        return {
            "status": "healthy",
            "service": "ai-engine",
            "database": "MongoDB"
        }
    except PyMongoError:
        raise HTTPException(
            status_code=503,
            detail="MongoDB connection unavailable"
        )


@app.post("/api/v1/evidence/validate")
def evidence_validation(request: EvidenceValidationRequest):
    return validate_evidence(
        source_text=request.source_text,
        evidence_excerpt=request.evidence_excerpt,
        source_id=request.source_id,
        facts=request.facts,
    )


@app.post("/api/v1/questions/generate")
def generate_question(request: GapQuestionRequest):
    question = generate_gap_question(
        topic=request.topic,
        status=request.status,
        conflicting_values=request.conflicting_values,
    )
    return {"question": question}


@app.post("/api/v1/evidence/freshness")
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
        raise HTTPException(status_code=422, detail=str(exc))


@app.get("/api/v1/evidence/freshness/scan")
def scan_all_evidence_freshness(
    max_age_days: int = Query(default=90, ge=1, le=3650),
    limit: int = Query(default=500, ge=1, le=1000),
):
    try:
        return scan_evidence_freshness(
            collection=evidence_collection,
            max_age_days=max_age_days,
            limit=limit,
        )

    except PyMongoError:
        raise HTTPException(
            status_code=503,
            detail="Could not scan evidence freshness in MongoDB"
        )


@app.post("/api/v1/evidence/self-reported")
def submit_self_report(request: SelfReportedEvidence):
    evidence = {
        "question": request.question,
        "answer": request.answer,
        "contributor_id": request.contributor_id,
        "submitted_at": request.submitted_at.isoformat(),
        "verification_status": request.verification_status.value
    }

    try:
        result = evidence_collection.insert_one(evidence)
        evidence["id"] = str(result.inserted_id)

    except PyMongoError:
        raise HTTPException(
            status_code=503,
            detail="Could not save evidence to MongoDB"
        )

    return {
        "id": evidence["id"],
        "question": evidence["question"],
        "answer": evidence["answer"],
        "contributor_id": evidence["contributor_id"],
        "submitted_at": evidence["submitted_at"],
        "verification_status": evidence["verification_status"],
        "message": "Evidence successfully saved to MongoDB"
    }


@app.get("/api/v1/evidence/self-reported")
def get_self_reported_evidence(
    q: str | None = None,
    contributor_id: str | None = None,
    verification_status: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    skip: int = Query(default=0, ge=0)
):
    filters = {}

    if q and q.strip():
        search_pattern = re.escape(q.strip())
        filters["$or"] = [
            {"question": {"$regex": search_pattern, "$options": "i"}},
            {"answer": {"$regex": search_pattern, "$options": "i"}}
        ]

    if contributor_id and contributor_id.strip():
        filters["contributor_id"] = contributor_id.strip()

    if verification_status and verification_status.strip():
        filters["verification_status"] = verification_status.strip()

    try:
        records = (
            evidence_collection.find(filters)
            .sort("_id", 1)
            .skip(skip)
            .limit(limit)
        )

        return [
            {
                "id": str(record["_id"]),
                "question": record["question"],
                "answer": record["answer"],
                "contributor_id": record["contributor_id"],
                "submitted_at": record["submitted_at"],
                "verification_status": record["verification_status"]
            }
            for record in records
        ]

    except PyMongoError:
        raise HTTPException(
            status_code=503,
            detail="Could not retrieve evidence from MongoDB"
        )
