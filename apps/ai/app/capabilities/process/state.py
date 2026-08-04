from typing import NotRequired
from typing import TypedDict

from app.capabilities.classify.state import ClassificationResult
from app.capabilities.extract.state import ExtractionResult


class EmailMessage(TypedDict):
    name: str
    email: str
    content: str


class TokenUsage(TypedDict):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class ProcessState(TypedDict):
    # Input
    subject: str
    thread: list[EmailMessage]
    instruction: NotRequired[str]

    # AI Results
    classification: NotRequired[ClassificationResult]
    extraction: NotRequired[ExtractionResult]
    summary: NotRequired[str]
    draft: NotRequired[str]

    # Metadata
    provider: NotRequired[str]
    model: NotRequired[str]
    usage: NotRequired[TokenUsage]