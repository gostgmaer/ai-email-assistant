from typing import NotRequired, TypedDict

from langchain_core.messages import AIMessage, BaseMessage


class Commitment(TypedDict):
    text: str
    due_date: str | None
    due_time: str | None
    confidence: float


class TokenUsage(TypedDict):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class CommitmentsState(TypedDict):
    # Input
    subject: str
    sender_name: str
    content: str
    sent_at: str
    sent_date: str
    timezone: str

    # Runtime
    system_prompt: NotRequired[str]
    messages: NotRequired[list[BaseMessage]]
    response: NotRequired[AIMessage]

    # Output
    commitments: NotRequired[list[Commitment]]

    # Metadata
    provider: NotRequired[str]
    model: NotRequired[str]
    usage: NotRequired[TokenUsage]
