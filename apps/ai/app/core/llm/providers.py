from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_groq import ChatGroq
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI

from app.config.settings import settings

from .base import BaseLLMProvider


class GoogleProvider(BaseLLMProvider):
    @property
    def name(self) -> str:
        return "google"

    def chat_model(self):
        return ChatGoogleGenerativeAI(
            model=settings.llm_model,
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
            model=settings.llm_model,
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
            model=settings.llm_model,
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
            model=settings.llm_model,
            api_key=settings.groq_api_key,
            temperature=settings.temperature,
            max_tokens=settings.max_tokens,
        )


class OllamaProvider(BaseLLMProvider):
    @property
    def name(self) -> str:
        return "ollama"

    def chat_model(self):
        return ChatOllama(
            model=settings.llm_model,
            temperature=settings.temperature,
        )


class OpenRouterProvider(BaseLLMProvider):
    @property
    def name(self) -> str:
        return "openrouter"

    def chat_model(self):
        return ChatOpenAI(
            model=settings.llm_model,
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