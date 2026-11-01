from pydantic import BaseModel, Field

MAX_CONTENT_LENGTH = 8000


class MeetingPickSchema(BaseModel):
    # 1-based number of the slot the reply accepts; null when it accepts none.
    picked: int | None = None
    confidence: float = 0


class MeetingPickRequest(BaseModel):
    # What was offered, as the reader saw it; numbered from 1 by position.
    slots: list[str] = Field(min_length=1, max_length=5)
    content: str = Field(max_length=MAX_CONTENT_LENGTH)


class TokenUsageSchema(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class MeetingPickResponse(BaseModel):
    pick: MeetingPickSchema
    provider: str
    model: str
    usage: TokenUsageSchema
