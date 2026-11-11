"""Sanchaya Analytics & PDF Service (Prakhar Raj), port 8002.
Called by the Node gateway through ANALYTICS_SERVICE_URL (http://analytics-service:8002)."""

from fastapi import FastAPI

from app.config import load_root_env
from app.routers_internal import router as internal_router
from app.routers_prakhar import router as project_router
from app.store import STORE

load_root_env()

app = FastAPI(title="Sanchaya Analytics Service: risk map, readiness checklist, handover, PDF")
app.include_router(internal_router)
app.include_router(project_router)


@app.get("/health")
def health():
    return {"status": "healthy", "service": "sanchaya-analytics-service", "store": STORE.kind}
