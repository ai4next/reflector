# =============================================================================
# Stage 1: Base — shared Python environment
# =============================================================================
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# =============================================================================
# Stage 2: Dependencies — layer caching for faster rebuilds
# =============================================================================
FROM base AS deps

COPY backend/requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# =============================================================================
# Stage 3: Production image
# =============================================================================
FROM deps AS production

COPY backend/app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]