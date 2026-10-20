from langchain_core.language_models.chat_models import BaseChatModel

from app.config.settings import settings

from .providers import PROVIDERS
from .providers import resolve_model_name

# Providers that don't require an API key to be usable.
_NO_KEY_REQUIRED = {"ollama"}


def _provider_is_configured(provider: str) -> bool:
    """Whether `provider` can safely be used as a fallback: it needs a
    resolvable model name (see resolve_model_name) and, unless it's in
    _NO_KEY_REQUIRED, an API key."""
    override = getattr(settings, f"{provider}_model", "") or ""
    if not resolve_model_name(provider, override):
        return False
    if provider in _NO_KEY_REQUIRED:
        return True
    return bool(getattr(settings, f"{provider}_api_key", "") or "")


class LLMManager:
    """Central manager for all LLM providers: builds/caches chat models
    per provider and exposes the fallback order that
    app/core/workflow/executor.py retries through."""

    def __init__(self):
        self._models: dict[str, BaseChatModel] = {}
        self._provider = settings.llm_provider.lower()

    @property
    def provider(self) -> str:
        return self._provider

    @property
    def model(self) -> str:
        return settings.llm_model

    def fallback_order(self) -> list[str]:
        """The primary provider first, then every other provider that
        _provider_is_configured() confirms is safely usable, in
        PROVIDERS' declared order. Never includes a provider that would
        receive a guessed or invalid model name."""
        ordered = [self._provider] if self._provider in PROVIDERS else []
        ordered += [
            name
            for name in PROVIDERS
            if name != self._provider and _provider_is_configured(name)
        ]
        return ordered

    def get_model(self, provider: str | None = None) -> BaseChatModel:
        """Returns a cached chat model instance for `provider`
        (defaults to the configured primary provider)."""
        name = (provider or self._provider).lower()

        if name not in self._models:
            provider_cls = PROVIDERS.get(name)

            if provider_cls is None:
                raise ValueError(f"Unsupported LLM provider: {name}")

            self._models[name] = provider_cls().chat_model()

        return self._models[name]

    def reload(self) -> BaseChatModel:
        """Force-rebuild the primary provider's cached model."""
        self._models.pop(self._provider, None)
        return self.get_model()


llm_manager = LLMManager()
