from typing import NotRequired, TypedDict

from langchain_core.messages import AIMessage, BaseMessage


class TokenUsage(TypedDict):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class RewriteState(TypedDict):
    # Input
    draft: str
    tone: str | None
    language: str | None
    instruction: NotRequired[str | None]
    writing_style: NotRequired[dict | None]

    # Runtime
    system_prompt: NotRequired[str]
    messages: NotRequired[list[BaseMessage]]
    response: NotRequired[AIMessage]

    # Output
    rewritten_draft: NotRequired[str]

    # Metadata
    provider: NotRequired[str]
    model: NotRequired[str]
    usage: NotRequired[TokenUsage]