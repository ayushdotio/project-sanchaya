FROM python:3.11-slim

WORKDIR /app

# Prevent Python from writing pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8001

# Install system dependencies if needed for compiling packages or health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip and install dependencies if requirements.txt exists
RUN pip install --no-cache-dir --upgrade pip
COPY requirements.txt* ./
RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi

# Copy application source code
COPY . .

# Expose port 8001 matching VARAD_AI_SERVICE_URL in docker-compose
EXPOSE 8001

# Run application: runs uvicorn/main.py if present, otherwise serves fallback stub on port 8001
CMD ["sh", "-c", "if [ -f main.py ]; then (uvicorn main:app --host 0.0.0.0 --port 8001 --reload 2>/dev/null || python main.py); else python3 -m http.server 8001; fi"]

