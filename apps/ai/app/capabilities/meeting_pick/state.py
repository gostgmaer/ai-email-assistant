from typing import NotRequired, TypedDict

from langchain_core.messages import AIMessage, BaseMessage


class TokenUsage(TypedDict):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class MeetingPickState(TypedDict):
    # Input
    slots: list[str]
    content: str

    # Runtime
    system_prompt: NotRequired[str]
    messages: NotRequired[list[BaseMessage]]
    response: NotRequired[AIMessage]

    # Output
    pick: NotRequired[dict]

    # Metadata
    provider: NotRequired[str]
    model: NotRequired[str]
    usage: NotRequired[TokenUsage]
