from typing import NotRequired, TypedDict

from langchain_core.messages import AIMessage, BaseMessage


class AnswerSource(TypedDict):
    n: int
    subject: str
    sender: str
    date: str
    content: str


class TokenUsage(TypedDict):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class AnswerState(TypedDict):
    # Input
    question: str
    today: str
    sources: list[AnswerSource]

    # Runtime
    system_prompt: NotRequired[str]
    messages: NotRequired[list[BaseMessage]]
    response: NotRequired[AIMessage]

    # Output
    answer: NotRequired[str]
    citations: NotRequired[list[int]]
    found: NotRequired[bool]

    # Metadata
    provider: NotRequired[str]
    model: NotRequired[str]
    usage: NotRequired[TokenUsage]
