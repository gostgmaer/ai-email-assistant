from typing import TypedDict


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
    # ===== Input =====
    subject: str
    thread: list[EmailMessage]
    instruction: str | None
    tone: str
    language: str

    # ===== Runtime =====
    prompt: str
    draft: str

    # ===== Metadata =====
    provider: str
    model: str
    usage: TokenUsage