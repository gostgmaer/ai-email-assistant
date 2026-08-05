from langchain_core.embeddings import Embeddings
from langchain_google_genai import GoogleGenerativeAIEmbeddings

from app.config.settings import settings


class EmbeddingManager:
    """Central manager for embedding providers, mirroring LLMManager."""

    def __init__(self):
        self._client: Embeddings | None = None
        self._provider = settings.embedding_provider.lower()

    @property
    def provider(self) -> str:
        return self._provider

    @property
    def model(self) -> str:
        return settings.embedding_model

    def get_client(self) -> Embeddings:
        """Returns a cached embeddings client instance."""

        if self._client is not None:
            return self._client

        if self._provider != "google":
            raise ValueError(
                f"Unsupported embedding provider: {self._provider}"
            )

        self._client = GoogleGenerativeAIEmbeddings(
            model=f"models/{settings.embedding_model}",
            google_api_key=settings.google_api_key,
            output_dimensionality=settings.embedding_dimensions,
        )

        return self._client

    def embed(self, text: str) -> list[float]:
        """Embed a single piece of text."""

        return self.get_client().embed_query(text)

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Embed multiple pieces of text in one call."""

        return self.get_client().embed_documents(texts)


embedding_manager = EmbeddingManager()
