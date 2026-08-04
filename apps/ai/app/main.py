from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes.email import router as email_router
from app.api.routes.health import router as health_router
from app.config.settings import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print(f"🚀 Starting {settings.app_name}")

    # TODO:
    # - Initialize LLM Manager
    # - Warm prompts cache
    # - Initialize vector store
    # - Health checks

    yield

    # Shutdown
    print("👋 Shutting down AI Platform")


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    lifespan=lifespan,
)

# Routers
app.include_router(health_router)
app.include_router(email_router)


@app.get("/")
async def root():
    return {
        "name": settings.app_name,
        "status": "running",
        "version": "1.0.0",
    }