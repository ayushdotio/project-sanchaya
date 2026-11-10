"""Entry point expected by services/analytics-service/Dockerfile:  uvicorn main:app --port 8002
Fallback:  python main.py"""
from app.main import app  # noqa: F401

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
