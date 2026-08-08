from typing import NotRequired, TypedDict

from langchain_core.messages import AIMessage, BaseMessage


class EmailMessage(TypedDict):
    name: str
    email: str
    content: str


class TokenUsage(TypedDict):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class ActionItem(TypedDict):
    task: str
    owner: str | None
    due_date: str | None


class SummarizeState(TypedDict):
    # Input
    subject: str
    thread: list[EmailMessage]

    # Runtime
    system_prompt: NotRequired[str]
    messages: NotRequired[list[BaseMessage]]
    response: NotRequired[AIMessage]

    # Output
    summary: NotRequired[str]
    key_points: NotRequired[list[str]]
    action_items: NotRequired[list[ActionItem]]
    important_dates: NotRequired[list[str]]
    participants: NotRequired[list[str]]
    decisions_made: NotRequired[list[str]]

    # Metadata
    provider: NotRequired[str]
    model: NotRequired[str]
    usage: NotRequired[TokenUsage]