from app.capabilities.classify.schemas import ClassificationSchema
from app.capabilities.extract.schemas import ExtractionSchema

from .config import WorkflowConfig
from .registry import register
from .types import MessageBuilderType
from .types import WorkflowOutputType


register(
    WorkflowConfig(
        name="reply",
        prompt="reply",
        builder=MessageBuilderType.EMAIL_THREAD,
        output=WorkflowOutputType.TEXT,
    )
)

register(
    WorkflowConfig(
        name="summarize",
        prompt="summarize",
        builder=MessageBuilderType.EMAIL_THREAD,
        output=WorkflowOutputType.TEXT,
    )
)

register(
    WorkflowConfig(
        name="rewrite",
        prompt="rewrite",
        builder=MessageBuilderType.EMAIL_DRAFT,
        output=WorkflowOutputType.TEXT,
    )
)

register(
    WorkflowConfig(
        name="classify",
        prompt="classify",
        builder=MessageBuilderType.EMAIL_THREAD,
        output=WorkflowOutputType.STRUCTURED,
        schema=ClassificationSchema,
    )
)

register(
    WorkflowConfig(
        name="extract",
        prompt="extract",
        builder=MessageBuilderType.EMAIL_THREAD,
        output=WorkflowOutputType.STRUCTURED,
        schema=ExtractionSchema,
    )
)