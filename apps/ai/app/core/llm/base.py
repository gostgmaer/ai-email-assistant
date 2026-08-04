from abc import ABC, abstractmethod

from langchain_core.embeddings import Embeddings
from langchain_core.language_models.chat_models import BaseChatModel


class BaseLLMProvider(ABC):
    """Base interface for AI providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        ...

    @abstractmethod
    def chat_model(self) -> BaseChatModel:
        ...

    