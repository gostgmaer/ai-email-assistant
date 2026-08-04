class WorkflowException(Exception):
    """Base workflow exception."""


class PromptNotFoundException(WorkflowException):
    """Prompt not found."""


class LLMExecutionException(WorkflowException):
    """LLM execution failed."""


class ResponseParsingException(WorkflowException):
    """Unable to parse model response."""