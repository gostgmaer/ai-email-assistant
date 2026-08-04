from langchain_core.language_models.chat_models import BaseChatModel

from app.config.settings import settings

from .providers import PROVIDERS


class LLMManager:
    """Central manager for all LLM providers."""

    def __init__(self):
        self._model: BaseChatModel | None = None
        self._provider = settings.llm_provider.lower()

    @property
    def provider(self) -> str:
        return self._provider

    @property
    def model(self) -> str:
        return settings.llm_model

    def get_model(self) -> BaseChatModel:
        """
        Returns a cached chat model instance.
        """

        if self._model is not None:
            return self._model

        provider_cls = PROVIDERS.get(self._provider)

        if provider_cls is None:
            raise ValueError(
                f"Unsupported LLM provider: {self._provider}"
            )

        self._model = provider_cls().chat_model()

        return self._model

    def reload(self) -> BaseChatModel:
        """
        Force reload model.
        """

        self._model = None
        return self.get_model()


llm_manager = LLMManager()