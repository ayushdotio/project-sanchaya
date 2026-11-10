"""Sanchaya Analytics & PDF Service (Prakhar Raj), port 8002.
Called by the Node gateway through PRAKHAR_ANALYTICS_SERVICE_URL (http://analytics-service:8002)."""
from fastapi import FastAPI

from app.routers_prakhar import router
from app.store import STORE

app = FastAPI(title="Sanchaya Analytics Service: risk map, readiness checklist, handover, PDF")
app.include_router(router)


@app.get("/health")
def health():
    return {"status": "healthy", "service": "sanchaya-analytics-service", "store": STORE.kind}
