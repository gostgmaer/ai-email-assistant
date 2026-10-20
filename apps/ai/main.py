from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import Depends, FastAPI

from app.api.auth import check_api_key_configured, require_api_key
from app.api.routes.calendar import router as calendar_router
from app.api.routes.documents import router as documents_router
from app.api.routes.email import router as email_router
from app.api.routes.health import router as health_router
from app.config.settings import settings
import app.core.workflow.workflow

if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        traces_sample_rate=0.1,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print(f"Starting {settings.app_name}")
    check_api_key_configured()

    # TODO:
    # - Initialize LLM Manager
    # - Warm prompts cache
    # - Initialize vector store
    # - Health checks

    yield

    # Shutdown
    print("Shutting down AI Platform")


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    lifespan=lifespan,
)

# Routers. Everything except the health check requires the shared API key
# (see app/api/auth.py) — this service exposes LLM calls and the user's
# document content to whoever can reach it.
protected = [Depends(require_api_key)]
app.include_router(health_router)
app.include_router(email_router, dependencies=protected)
app.include_router(documents_router, dependencies=protected)
app.include_router(calendar_router, dependencies=protected)


@app.get("/")
async def root():
    return {
        "name": settings.app_name,
        "status": "running",
        "version": "1.0.0",
    }
