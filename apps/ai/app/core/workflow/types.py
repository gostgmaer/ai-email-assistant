from enum import Enum


class WorkflowOutputType(str, Enum):
    TEXT = "text"
    STRUCTURED = "structured"


class MessageBuilderType(str, Enum):
    EMAIL_THREAD = "email_thread"
    EMAIL_DRAFT = "email_draft"