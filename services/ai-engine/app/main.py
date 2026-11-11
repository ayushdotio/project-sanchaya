"""FastAPI application entrypoint for Sanchaya AI Engine."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pymongo.errors import PyMongoError

from app.api.internal import router as internal_router
from app.api.v1 import router as v1_router
from app.core.config import get_settings
from app.database import check_mongodb_connection


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Ensure root .env / settings are initialized once at startup without failing if DB is remote/lazy.
    get_settings()
    yield


app = FastAPI(
    title="Sanchaya AI Engine",
    description="AI-powered knowledge extraction and deterministic evidence validation service.",
    version="1.0.0",
    lifespan=lifespan,
)

app.include_router(internal_router)
app.include_router(v1_router)


@app.get("/")
def home():
    return {
        "message": "Welcome to Sanchaya AI Engine",
        "status": "running",
    }


@app.get("/health")
def health_check():
    try:
        check_mongodb_connection()
        return {
            "status": "healthy",
            "service": "ai-engine",
            "database": get_settings().database_name,
        }
    except (PyMongoError, RuntimeError) as exc:
        raise HTTPException(
            status_code=503,
            detail=f"MongoDB connection unavailable: {exc}",
        ) from exc
