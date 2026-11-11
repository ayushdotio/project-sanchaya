"""Canonical Pydantic v2 schemas and enums for Sanchaya AI Engine."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class EvidenceStatus(str, Enum):
    """Canonical 4-state verification status matching Finding.ts and AGENTS.md."""

    SUPPORTED = "Supported"
    NEEDS_REVIEW = "Needs review"
    CONFLICTING = "Conflicting"
    UNKNOWN = "Unknown"


class FindingCategory(str, Enum):
    """Canonical finding categories matching Finding.ts."""

    DECISION = "decision"
    TASK = "task"
    BLOCKER = "blocker"
    DEPENDENCY = "dependency"


class EvidenceOrigin(str, Enum):
    """Canonical evidence origin matching Finding.ts."""

    SYSTEM = "system"
    SELF_REPORTED = "self_reported"


class ReviewStatus(str, Enum):
    """Canonical review status matching Finding.ts."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class GapCategory(str, Enum):
    """Deterministic Stage 3-4 gap categories."""

    MISSING_OWNER = "missing_owner"
    MISSING_RATIONALE = "missing_rationale"
    UNKNOWN_CLAIM = "unknown_claim"
    CONFLICTING_SOURCES = "conflicting_sources"


class GapQuestionStatus(str, Enum):
    """Canonical gap question lifecycle status matching GapQuestion.ts."""

    PENDING = "pending"
    ANSWERED = "answered"
    APPROVED = "approved"


# ---------------------------------------------------------------------------
# Stage 2: LLM Extraction Schemas
# ---------------------------------------------------------------------------


class ExtractedFindingCandidate(BaseModel):
    """Structured finding candidate extracted by Module 1 (ai_extractor)."""

    model_config = ConfigDict(extra="ignore")

    category: FindingCategory
    claim: str = Field(min_length=1, max_length=2000)
    source_id: str = Field(min_length=1, max_length=100)
    verbatim_excerpt: str = Field(default="", max_length=4000)
    owner: str | None = Field(default=None, max_length=200)
    deadline: str | None = Field(default=None, max_length=200)
    rationale: str | None = Field(default=None, max_length=2000)
    topic: str | None = Field(default=None, max_length=300)
    is_informal_note: bool = False

    @field_validator(
        "claim",
        "source_id",
        "verbatim_excerpt",
        "owner",
        "deadline",
        "rationale",
        "topic",
        mode="before",
    )
    @classmethod
    def normalize_optional_strings(cls, value: Any) -> Any:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped
        return value

    @field_validator("owner", "deadline", "rationale", "topic", mode="after")
    @classmethod
    def empty_to_none(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            return None
        return value


class ExtractionBatchOutput(BaseModel):
    """Top-level JSON schema enforced on LLM extraction output."""

    model_config = ConfigDict(extra="forbid")

    findings: list[ExtractedFindingCandidate] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Stage 3: Verification, Conflict & Freshness Schemas
# ---------------------------------------------------------------------------


class ConflictVersion(BaseModel):
    """One side of a temporal/cross-source conflict preserved for human review."""

    source_id: str
    claim: str | None = None
    verbatim_excerpt: str = ""
    recorded_at: str | None = None
    source_type: str | None = None
    origin: str | None = None
    url: str | None = None


class ConflictDetails(BaseModel):
    """Structured conflict details preserving earlier & newer conflicting versions."""

    topic: str
    earlier_version: ConflictVersion
    newer_version: ConflictVersion
    all_versions: list[ConflictVersion] = Field(default_factory=list)


class FreshnessInfo(BaseModel):
    """Freshness indicator attached alongside verification status."""

    source_updated_at: str | None = None
    recheck_recommended: bool = False
    reason: str | None = None


class EvidenceValidationResult(BaseModel):
    """Result returned by deterministic evidence validation."""

    status: EvidenceStatus
    explanation: str
    source_id: str | None = None
    conflicting_source_id: str | None = None
    conflict_details: ConflictDetails | None = None
    freshness: FreshnessInfo | None = None


class DecisionFact(BaseModel):
    """Normalized decision/claim fact used for temporal conflict comparison."""

    topic: str
    value: str
    source_id: str
    evidence_excerpt: str
    recorded_at: str
    supersedes_source_id: str | None = None
    source_type: str | None = None
    origin: str | None = None
    url: str | None = None


class ProjectDecision(BaseModel):
    """Structured project decision DTO."""

    decision: str
    owner: str | None = None
    deadline: str | None = None
    source_id: str
    verbatim_excerpt: str


# ---------------------------------------------------------------------------
# Canonical MongoDB Document Models (matching services/backend Mongoose schemas)
# ---------------------------------------------------------------------------


class SourceRecordMetadata(BaseModel):
    model_config = ConfigDict(extra="allow")

    redactionCount: int = 0
    author: str = ""
    url: str = ""
    fileId: str = ""
    filePath: str = ""
    sha: str = ""
    branch: str = ""
    itemCount: int = 0


class SourceRecordDoc(BaseModel):
    """Canonical representation of a MongoDB ``source_records`` document."""

    model_config = ConfigDict(extra="allow", arbitrary_types_allowed=True)

    projectId: Any
    source_id: str
    source_type: Literal["github", "document", "task"]
    origin: str
    raw_filename: str = ""
    redacted_content: str
    metadata: SourceRecordMetadata = Field(default_factory=SourceRecordMetadata)
    created_at: datetime | str
    updated_at: datetime | str
    imported_at: datetime | str | None = None


class FindingDoc(BaseModel):
    """Canonical representation of a MongoDB ``findings`` document (Finding.ts)."""

    model_config = ConfigDict(extra="allow", arbitrary_types_allowed=True)

    projectId: Any
    claim: str
    category: FindingCategory
    source_id: str = Field(min_length=1)
    verbatim_excerpt: str = Field(min_length=1)
    verification_status: EvidenceStatus = EvidenceStatus.UNKNOWN
    evidence_origin: EvidenceOrigin = EvidenceOrigin.SYSTEM
    review_status: ReviewStatus = ReviewStatus.PENDING
    owner: str | None = None
    deadline: str | None = None
    rationale: str | None = None
    topic: str | None = None
    conflicting_source_id: str | None = None
    conflict_details: ConflictDetails | None = None
    freshness: FreshnessInfo | None = None
    explanation: str | None = None
    reviewedBy: Any = None
    reviewedAt: datetime | None = None
    createdAt: datetime | None = None
    updatedAt: datetime | None = None


class GapQuestionDoc(BaseModel):
    """Canonical representation of a MongoDB ``gap_questions`` document (GapQuestion.ts)."""

    model_config = ConfigDict(extra="allow", arbitrary_types_allowed=True)

    projectId: Any
    relatedFindingId: Any = None
    question: str = Field(min_length=1)
    status: GapQuestionStatus = GapQuestionStatus.PENDING
    answer: str = ""
    answeredBy: Any = None
    answeredAt: datetime | None = None
    evidence_badge: str = "Self-reported"
    gap_category: GapCategory | None = None
    createdAt: datetime | None = None
    updatedAt: datetime | None = None


# ---------------------------------------------------------------------------
# API Request / Response Models
# ---------------------------------------------------------------------------


class ExtractAndVerifyRequest(BaseModel):
    """Body sent by PythonBridge.triggerExtractionAndVerify."""

    projectId: str = Field(min_length=1)
    sourceRecords: list[dict[str, Any]] | None = None
    databaseName: str | None = None


class ExtractAndVerifyResponse(BaseModel):
    """Response expected by PythonBridge.ExtractionResponse."""

    success: bool = True
    message: str
    findingsCount: int
    supportedCount: int
    gapsGenerated: int


class EvidenceValidationRequest(BaseModel):
    source_text: str | None = None
    evidence_excerpt: str | None = None
    claim: str | None = None
    source_id: str | None = None
    projectId: str | None = None
    topic: str | None = None
    category: FindingCategory | None = None
    owner: str | None = None
    deadline: str | None = None
    facts: list[DecisionFact] | None = None


class GapQuestionRequest(BaseModel):
    topic: str
    status: EvidenceStatus
    conflicting_values: list[str] | None = None


class FreshnessCheckRequest(BaseModel):
    recorded_at: str
    max_age_days: int = Field(default=90, ge=1, le=3650)


class FreshnessScanRequest(BaseModel):
    projectId: str = Field(min_length=1)
    max_age_days: int = Field(default=90, ge=1, le=3650)
    limit: int = Field(default=500, ge=1, le=1000)
