
from datetime import date
from enum import Enum

from pydantic import BaseModel, Field, field_validator


class EvidenceStatus(str, Enum):
    SUPPORTED = "supported"
    NEEDS_REVIEW = "needs_review"
    CONFLICTING = "conflicting"
    UNKNOWN = "unknown"


class ProjectDecision(BaseModel):
    decision: str
    owner: str | None = None
    deadline: str | None = None
    source_id: str
    evidence_excerpt: str


class EvidenceValidationResult(BaseModel):
    status: EvidenceStatus
    explanation: str
    source_id: str | None = None


class DecisionFact(BaseModel):
    topic: str
    value: str
    source_id: str
    evidence_excerpt: str
    recorded_at: str
    supersedes_source_id: str | None = None


class SelfReportedEvidence(BaseModel):
    question: str = Field(min_length=5, max_length=1000)
    answer: str = Field(min_length=2, max_length=5000)
    contributor_id: str = Field(min_length=3, max_length=100)
    submitted_at: date
    verification_status: EvidenceStatus = EvidenceStatus.NEEDS_REVIEW

    @field_validator(
        "question",
        "answer",
        "contributor_id",
        mode="before"
    )
    @classmethod
    def strip_whitespace(cls, value):
        if isinstance(value, str):
            return value.strip()
        return value


class EvidenceValidationRequest(BaseModel):
    source_text: str | None = None
    evidence_excerpt: str | None = None
    source_id: str | None = None
    facts: list[DecisionFact] | None = None


class GapQuestionRequest(BaseModel):
    topic: str
    status: EvidenceStatus
    conflicting_values: list[str] | None = None


class FreshnessCheckRequest(BaseModel):
    recorded_at: str
    max_age_days: int = Field(default=90, ge=1, le=3650)
