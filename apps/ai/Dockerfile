# Build context: apps/ai (self-contained, no monorepo pnpm workspace deps).

FROM python:3.14-slim AS base

# git is needed at build time only: uv.lock pins easydev-file-upload-sdk to
# a git+https source (not yet published to PyPI). tesseract-ocr is needed
# at runtime — pytesseract (a Python dependency) just shells out to the
# `tesseract` binary, it doesn't bundle it. Retry loop + No-Cache (bypass
# whatever's between this network and the Debian mirror re-serving stale
# index data) work around a persistent "Hash Sum mismatch" on this
# network — and unlike a bare `for...done`, this checks success
# explicitly afterwards: a `for` loop's own exit status is its last
# command's, which on total failure is the trailing `sleep`, not the
# failed apt-get — so a silent all-attempts-failed would otherwise report
# success and let the build limp on without git/tesseract actually
# installed.
RUN for i in 1 2 3 4 5; do \
      apt-get update -o Acquire::http::No-Cache=true \
      && apt-get install -y --no-install-recommends git tesseract-ocr \
      && break \
      || sleep 5; \
    done; \
    command -v git && command -v tesseract \
    && rm -rf /var/lib/apt/lists/*

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
