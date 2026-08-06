# Build context: apps/ai (self-contained, no monorepo pnpm workspace deps).

FROM python:3.14-slim AS base

RUN for i in 1 2 3 4 5; do pip install --no-cache-dir uv && break || sleep 5; done; \
    command -v uv

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN for i in 1 2 3 4 5; do \
      rm -rf .venv; \
      uv sync --frozen --no-dev && test -f .venv/bin/uvicorn && break || sleep 5; \
    done; test -f .venv/bin/uvicorn

COPY . .

ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
