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
    llm_model: str = "gemini-3.5-flash-lite"

    embedding_provider: str = "google"
    embedding_model: str = "text-embedding-004"

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


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()