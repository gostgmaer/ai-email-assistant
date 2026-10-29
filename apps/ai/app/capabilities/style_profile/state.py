from typing import NotRequired, TypedDict

from langchain_core.messages import AIMessage, BaseMessage


class TokenUsage(TypedDict):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class StyleProfileState(TypedDict):
    # Input
    samples: list[str]
    names: list[str]

    # Runtime
    system_prompt: NotRequired[str]
    messages: NotRequired[list[BaseMessage]]
    response: NotRequired[AIMessage]

    # Output
    profile: NotRequired[dict]

    # Metadata
    provider: NotRequired[str]
    model: NotRequired[str]
    usage: NotRequired[TokenUsage]
