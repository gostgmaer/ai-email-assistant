from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings
from pydantic_settings import SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        case_sensitive=False,
    )

    # ============================================================
    # Application
    # ============================================================

    app_name: str = "EasyDev AI Platform"
    app_env: str = "development"
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    app_debug: bool = True

    # ============================================================
    # AI Provider
    # ============================================================

    llm_provider: str = "google"
    llm_model: str = "gemini-3.1-flash-lite"

    embedding_provider: str = "google"
    embedding_model: str = "gemini-embedding-001"
    embedding_dimensions: int = 768

    # ============================================================
    # API Keys
    # ============================================================

    google_api_key: str = ""

    openai_api_key: str = ""

    anthropic_api_key: str = ""

    groq_api_key: str = ""

    openrouter_api_key: str = ""

    # ============================================================
    # Ollama
    # ============================================================

    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen3:14b"

    # ============================================================
    # Model
    # ============================================================

    temperature: float = Field(default=0.2)

    top_p: float = Field(default=0.95)

    max_tokens: int = Field(default=4096)

    streaming: bool = True

    # ============================================================
    # Prompt
    # ============================================================

    prompts_directory: str = "app/prompts"

    # ============================================================
    # Logging
    # ============================================================

    log_level: str = "INFO"

    # ============================================================
    # File Upload Service — documents are uploaded there by apps/api;
    # this service downloads them directly using the same HMAC scheme
    # as @easydev_org/file-upload-sdk (see app/core/file_service_client.py).
    # ============================================================

    file_service_url: str = "http://localhost:4001"
    file_service_hmac_secret: str = ""
    file_service_tenant_id: str = "easydev"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()