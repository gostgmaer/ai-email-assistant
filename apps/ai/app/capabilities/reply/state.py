from typing import TypedDict
from langchain_core.messages import BaseMessage
from langchain_core.messages import AIMessage
from typing import NotRequired


class EmailMessage(TypedDict):
    role: str
    name: str
    email: str
    content: str


class TokenUsage(TypedDict):
    input_tokens: int
    output_tokens: int
    total_tokens: int




class ReplyState(TypedDict):
    # Input
    subject: str
    thread: list[EmailMessage]
    tone: str
    language: str
    instruction: NotRequired[str]

    # Runtime
    system_prompt: NotRequired[str]
    messages: NotRequired[list[BaseMessage]]
    response: NotRequired[AIMessage]

    # Output
    draft: NotRequired[str]

    # Metadata
    provider: NotRequired[str]
    model: NotRequired[str]
    usage: NotRequired[TokenUsage]