from typing import NotRequired
from typing import TypedDict

from langchain_core.messages import AIMessage
from langchain_core.messages import BaseMessage


class EmailMessage(TypedDict):
    name: str
    email: str
    content: str


class TokenUsage(TypedDict):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class ClassificationResult(TypedDict):
    category: str
    priority: str
    sentiment: str
    spam: bool


class ClassifyState(TypedDict):
    # Input
    subject: str
    thread: list[EmailMessage]

    # Runtime
    system_prompt: NotRequired[str]
    messages: NotRequired[list[BaseMessage]]
    response: NotRequired[AIMessage]

    # Output
    classification: NotRequired[ClassificationResult]

    # Metadata
    provider: NotRequired[str]
    model: NotRequired[str]
    usage: NotRequired[TokenUsage]