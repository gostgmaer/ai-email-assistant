from typing import Any

from langchain_core.messages import BaseMessage
from pydantic import BaseModel

from app.core.llm import llm_manager

from .config import WorkflowConfig
from .types import WorkflowOutputType


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