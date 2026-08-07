from typing import NotRequired, TypedDict

from langchain_core.messages import AIMessage, BaseMessage


class BusyInterval(TypedDict):
    start: str
    end: str


class TokenUsage(TypedDict):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class MeetingTimeResult(TypedDict):
    start: str
    end: str
    title: str


class SuggestMeetingTimeState(TypedDict):
    # Input
    description: str
    reference_date: str
    busy: list[BusyInterval]

    # Runtime
    system_prompt: NotRequired[str]
    messages: NotRequired[list[BaseMessage]]
    response: NotRequired[AIMessage]

    # Output
    suggestion: NotRequired[MeetingTimeResult]

    # Metadata
    provider: NotRequired[str]
    model: NotRequired[str]
    usage: NotRequired[TokenUsage]
