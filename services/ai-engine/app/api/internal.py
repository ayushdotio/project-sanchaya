"""Internal service-to-service endpoints called by services/backend (PythonBridge)."""

from __future__ import annotations

import hmac

from fastapi import APIRouter, Header, HTTPException
from pymongo.errors import PyMongoError

from app.core.config import get_settings
from app.models.schemas import ExtractAndVerifyRequest, ExtractAndVerifyResponse
from app.services.ai_extractor import (
    ExtractionValidationError,
    MissingLLMConfigurationError,
)
from app.services.llm_client import LLMProviderError
from app.services.pipeline import run_extract_and_verify

router = APIRouter(prefix="/internal", tags=["internal"])


def _verify_internal_token(x_internal_token: str | None) -> None:
    settings = get_settings()
    expected = settings.internal_api_token
    if not expected:
        return
    if not x_internal_token or not hmac.compare_digest(x_internal_token, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing internal token")


@router.post("/extract-and-verify", response_model=ExtractAndVerifyResponse)
def extract_and_verify(
    request: ExtractAndVerifyRequest,
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
) -> ExtractAndVerifyResponse:
    """Trigger Stage 2 extraction, Stage 3 verification & freshness, and Stage 4 gaps."""
    _verify_internal_token(x_internal_token)

    try:
        return run_extract_and_verify(
            request.projectId,
            source_records_override=request.sourceRecords,
            database_name=request.databaseName,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except MissingLLMConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except (ExtractionValidationError, LLMProviderError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except PyMongoError as exc:
        raise HTTPException(status_code=503, detail="MongoDB operation failed") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

