from dataclasses import dataclass

from pydantic import BaseModel

from .types import MessageBuilderType
from .types import WorkflowOutputType


@dataclass(slots=True, frozen=True)
class WorkflowConfig:
    """Workflow configuration."""

    name: str

    prompt: str

    builder: MessageBuilderType

    output: WorkflowOutputType

    schema: type[BaseModel] | None = None