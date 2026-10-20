import asyncio
import logging
import time
from typing import Any

from langchain_core.messages import BaseMessage
from pydantic import BaseModel

from app.core.llm import llm_manager

from .config import WorkflowConfig
from .exceptions import LLMExecutionException
from .types import WorkflowOutputType

logger = logging.getLogger(__name__)

# Attempts on a single provider before moving to the next one in
# llm_manager.fallback_order(), and the backoff base (seconds) between
# same-provider attempts: attempt_index * _BACKOFF_BASE_SECONDS.
_MAX_ATTEMPTS_PER_PROVIDER = 2
_BACKOFF_BASE_SECONDS = 1.5


def _build_llm(provider: str, *, schema: type[BaseModel] | None = None):
    llm = llm_manager.get_model(provider)
    if schema is not None:
        llm = llm.with_structured_output(schema)
    return llm


def _invoke_with_fallback(
    messages: list[BaseMessage],
    *,
    schema: type[BaseModel] | None = None,
) -> Any:
    """Synchronous LLM call with same-provider retry + backoff, then
    cross-provider fallback. Every exception is treated as retryable —
    provider SDKs don't share an exception hierarchy we can reliably
    special-case, and a bad response from one provider is exactly the
    case fallback should route around. Raises LLMExecutionException,
    chained to the last underlying error, once every configured provider
    is exhausted."""
    last_error: Exception | None = None

    for provider in llm_manager.fallback_order():
        llm = _build_llm(provider, schema=schema)

        for attempt in range(1, _MAX_ATTEMPTS_PER_PROVIDER + 1):
            try:
                return llm.invoke(messages)
            except Exception as exc:  # noqa: BLE001 - see docstring
                last_error = exc
                logger.warning(
                    "LLM call failed (provider=%s, attempt=%d/%d): %s",
                    provider,
                    attempt,
                    _MAX_ATTEMPTS_PER_PROVIDER,
                    exc,
                )
                if attempt < _MAX_ATTEMPTS_PER_PROVIDER:
                    time.sleep(_BACKOFF_BASE_SECONDS * attempt)

    raise LLMExecutionException(
        f"All LLM providers exhausted: {llm_manager.fallback_order()}"
    ) from last_error


async def _ainvoke_with_fallback(
    messages: list[BaseMessage],
    *,
    schema: type[BaseModel] | None = None,
) -> Any:
    """Async counterpart of _invoke_with_fallback — same policy."""
    last_error: Exception | None = None

    for provider in llm_manager.fallback_order():
        llm = _build_llm(provider, schema=schema)

        for attempt in range(1, _MAX_ATTEMPTS_PER_PROVIDER + 1):
            try:
                return await llm.ainvoke(messages)
            except Exception as exc:  # noqa: BLE001 - see docstring
                last_error = exc
                logger.warning(
                    "LLM call failed (provider=%s, attempt=%d/%d): %s",
                    provider,
                    attempt,
                    _MAX_ATTEMPTS_PER_PROVIDER,
                    exc,
                )
                if attempt < _MAX_ATTEMPTS_PER_PROVIDER:
                    await asyncio.sleep(_BACKOFF_BASE_SECONDS * attempt)

    raise LLMExecutionException(
        f"All LLM providers exhausted: {llm_manager.fallback_order()}"
    ) from last_error


class LLMExecutor:
    """Thin executor used directly by per-capability nodes.

    Every call retries transient failures on the configured provider,
    then fails over to the next configured provider (see
    app/core/llm/manager.py and _invoke_with_fallback above).
    """

    def invoke(self, messages: list[BaseMessage]) -> Any:
        return _invoke_with_fallback(messages)

    def invoke_structured(
        self,
        *,
        messages: list[BaseMessage],
        schema: type[BaseModel],
    ) -> Any:
        return _invoke_with_fallback(messages, schema=schema)

    @property
    def provider(self) -> str:
        return llm_manager.provider

    @property
    def model(self) -> str:
        return llm_manager.model


llm_executor = LLMExecutor()


class WorkflowExecutor:
    """Central workflow executor. execute()/execute_sync() retry and
    fail over exactly like LLMExecutor above."""

    async def execute(
        self,
        *,
        config: WorkflowConfig,
        messages: list[BaseMessage],
    ) -> Any:
        schema = (
            config.schema
            if config.output == WorkflowOutputType.STRUCTURED
            else None
        )
        return await _ainvoke_with_fallback(messages, schema=schema)

    def execute_sync(
        self,
        *,
        config: WorkflowConfig,
        messages: list[BaseMessage],
    ) -> Any:
        schema = (
            config.schema
            if config.output == WorkflowOutputType.STRUCTURED
            else None
        )
        return _invoke_with_fallback(messages, schema=schema)


workflow_executor = WorkflowExecutor()
