"""Entry point for services/ai-engine: uvicorn main:app --port 8001 or python main.py."""
from app.main import app  # noqa: F401

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)

