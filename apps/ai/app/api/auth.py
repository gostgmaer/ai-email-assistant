import hmac

from fastapi import Header, HTTPException, status
from loguru import logger

from app.config.settings import settings


def check_api_key_configured() -> None:
    """Called at startup. Production refuses to run without a key; elsewhere
    a missing key only warns, so local development keeps working."""
    if settings.ai_service_api_key:
        return

    if settings.app_env.lower() == "production":
        raise RuntimeError(
            "AI_SERVICE_API_KEY must be set in production — without it every "
            "LLM endpoint (and the user documents behind them) is reachable "
            "by anyone who can reach this service."
        )

    logger.warning(
        "AI_SERVICE_API_KEY is not set — API key authentication is DISABLED. "
        "Set it (and the same value in apps/api/.env) outside local development."
    )


async def require_api_key(authorization: str | None = Header(default=None)) -> None:
    """FastAPI dependency: the caller (apps/api) must send
    `Authorization: Bearer <AI_SERVICE_API_KEY>`."""
    expected = settings.ai_service_api_key
    if not expected:
        return

    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not hmac.compare_digest(
        token.encode(), expected.encode()
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
            headers={"WWW-Authenticate": "Bearer"},
        )
