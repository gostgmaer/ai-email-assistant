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


class ExtractionResult(TypedDict):
    people: list[str]
    emails: list[str]
    phones: list[str]
    companies: list[str]
    dates: list[str]
    urls: list[str]
    tasks: list[str]
    meeting_requests: list[str]


class ExtractState(TypedDict):
    # Input
    subject: str
    thread: list[EmailMessage]

    # Runtime
    system_prompt: NotRequired[str]
    messages: NotRequired[list[BaseMessage]]
    response: NotRequired[AIMessage]

    # Output
    extraction: NotRequired[ExtractionResult]

    # Metadata
    provider: NotRequired[str]
    model: NotRequired[str]
    usage: NotRequired[TokenUsage]