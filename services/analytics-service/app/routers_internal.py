"""Internal service-to-service endpoints called by services/backend (PythonBridge)."""

from __future__ import annotations

import hmac
import io

from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from pymongo.errors import PyMongoError

from app.canonical import (
    build_pdf_bytes_for_project,
    compute_risk_and_readiness_for_project,
)
from app.config import get_internal_api_token
from app.store import get_canonical_database

router = APIRouter(prefix="/internal", tags=["internal"])


def _verify_internal_token(x_internal_token: str | None) -> None:
    expected = get_internal_api_token()
    if not expected:
        return
    if not x_internal_token or not hmac.compare_digest(x_internal_token, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing internal token")


class ComputeRiskAndReadinessRequest(BaseModel):
    projectId: str = Field(min_length=1)


@router.post("/compute-risk-and-readiness")
def compute_risk_and_readiness(
    request: ComputeRiskAndReadinessRequest,
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
):
    """Compute contribution concentration risk & 7-point readiness for a MongoDB project."""
    _verify_internal_token(x_internal_token)
    try:
        db = get_canonical_database()
        return compute_risk_and_readiness_for_project(db, request.projectId)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="MongoDB operation failed") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/generate-pdf/{project_id}")
def generate_project_pdf(
    project_id: str,
    allow_draft: bool = Query(default=False),
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
):
    """Stream an evidence-linked ReportLab handover PDF from an in-memory BytesIO buffer."""
    _verify_internal_token(x_internal_token)
    try:
        db = get_canonical_database()
        pdf_bytes = build_pdf_bytes_for_project(db, project_id, allow_draft=allow_draft)
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="sanchaya-handover-{project_id}.pdf"'
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="MongoDB operation failed") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

