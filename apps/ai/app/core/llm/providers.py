import warnings

from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI

from app.config.settings import settings

from .base import BaseLLMProvider

warnings.filterwarnings(
    "ignore",
    message=r".*uses fixed sampling defaults.*",
    category=UserWarning,
    module="langchain_google_genai.*",
)


def resolve_model_name(provider: str, override: str = "") -> str:
    """The model name a provider should use.

    llm_model is only guaranteed valid for settings.llm_provider (the
    primary provider) — every other provider must use its own
    "<provider>_model" override (passed in as `override`), since a
    fallback provider getting handed the primary's model name would send
    an invalid model to its API (e.g. a Gemini model name sent to
    OpenAI). Returns "" when neither applies, meaning: not safely usable.
    """
    if provider == settings.llm_provider:
        return settings.llm_model
    return override


class GoogleProvider(BaseLLMProvider):
    @property
    def name(self) -> str:
        return "google"

    def chat_model(self):
        return ChatGoogleGenerativeAI(
            model=resolve_model_name(self.name, settings.google_model),
            google_api_key=settings.google_api_key,
            temperature=settings.temperature,
            max_tokens=settings.max_tokens,
        )


class OpenAIProvider(BaseLLMProvider):
    @property
    def name(self) -> str:
        return "openai"

    def chat_model(self):
        return ChatOpenAI(
            model=resolve_model_name(self.name, settings.openai_model),
            api_key=settings.openai_api_key,
            temperature=settings.temperature,
            max_tokens=settings.max_tokens,
        )


class AnthropicProvider(BaseLLMProvider):
    @property
    def name(self) -> str:
        return "anthropic"

    def chat_model(self):
        return ChatAnthropic(
            model=resolve_model_name(self.name, settings.anthropic_model),
            api_key=settings.anthropic_api_key,
            temperature=settings.temperature,
            max_tokens=settings.max_tokens,
        )


class GroqProvider(BaseLLMProvider):
    @property
    def name(self) -> str:
        return "groq"

    def chat_model(self):
        return ChatGroq(
            model=resolve_model_name(self.name, settings.groq_model),
            api_key=settings.groq_api_key,
            temperature=settings.temperature,
            max_tokens=settings.max_tokens,
        )


class OllamaProvider(BaseLLMProvider):
    @property
    def name(self) -> str:
        return "ollama"

    def chat_model(self):
        # Unlike the other providers, Ollama has always had its own
        # dedicated ollama_model/ollama_base_url settings — previously
        # declared but never actually read here (chat_model() used to
        # pass settings.llm_model, e.g. "gemini-3.1-flash-lite", straight
        # to ChatOllama, and ignored ollama_base_url entirely).
        return ChatOllama(
            model=settings.ollama_model,
            base_url=settings.ollama_base_url,
            temperature=settings.temperature,
        )


class OpenRouterProvider(BaseLLMProvider):
    @property
    def name(self) -> str:
        return "openrouter"

    def chat_model(self):
        return ChatOpenAI(
            model=resolve_model_name(self.name, settings.openrouter_model),
            api_key=settings.openrouter_api_key,
            base_url="https://openrouter.ai/api/v1",
            temperature=settings.temperature,
            max_tokens=settings.max_tokens,
        )


PROVIDERS: dict[str, type[BaseLLMProvider]] = {
    "google": GoogleProvider,
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "groq": GroqProvider,
    "ollama": OllamaProvider,
    "openrouter": OpenRouterProvider,
}
