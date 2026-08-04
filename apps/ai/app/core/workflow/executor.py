from typing import Any

from langchain_core.messages import BaseMessage
from pydantic import BaseModel

from app.core.llm import llm_manager

from .config import WorkflowConfig
from .types import WorkflowOutputType


class LLMExecutor:
    """Thin executor used directly by per-capability nodes."""

    def invoke(self, messages: list[BaseMessage]) -> Any:
        return llm_manager.get_model().invoke(messages)

    def invoke_structured(
        self,
        *,
        messages: list[BaseMessage],
        schema: type[BaseModel],
    ) -> Any:
        return llm_manager.get_model().with_structured_output(schema).invoke(messages)

    @property
    def provider(self) -> str:
        return llm_manager.provider

    @property
    def model(self) -> str:
        return llm_manager.model


llm_executor = LLMExecutor()


class WorkflowExecutor:
    """Central workflow executor."""

    async def execute(
        self,
        *,
        config: WorkflowConfig,
        messages: list[BaseMessage],
    ) -> Any:
        llm = llm_manager.get_model()

        if (
            config.output
            == WorkflowOutputType.STRUCTURED
        ):
            llm = llm.with_structured_output(
                config.schema,
            )

        return await llm.ainvoke(
            messages,
        )

    def execute_sync(
        self,
        *,
        config: WorkflowConfig,
        messages: list[BaseMessage],
    ) -> Any:
        llm = llm_manager.get_model()

        if (
            config.output
            == WorkflowOutputType.STRUCTURED
        ):
            llm = llm.with_structured_output(
                config.schema,
            )

        return llm.invoke(
            messages,
        )


workflow_executor = WorkflowExecutor()