from pydantic import BaseModel, Field

# apps/api strips quoted history before sending; the cap keeps one request
# from carrying an unbounded prompt.
MAX_CONTENT_LENGTH = 8000


class CommitmentSchema(BaseModel):
    text: str
    # ISO date (YYYY-MM-DD) the promise is due, resolved against the sent
    # date; null when the message gives no deadline.
    due_date: str | None = None
    # "HH:MM" (24h) when the message names a time of day; otherwise null.
    due_time: str | None = None
    confidence: float = 0


class CommitmentListSchema(BaseModel):
    commitments: list[CommitmentSchema] = []


class CommitmentsRequest(BaseModel):
    subject: str
    sender_name: str = ""
    content: str = Field(max_length=MAX_CONTENT_LENGTH)
    # When the message was sent, on the sender's local clock, e.g.
    # "Tuesday 2026-10-27 14:05" — what "Friday" and "tomorrow" mean.
    sent_at: str
    # The same moment's date alone (YYYY-MM-DD); no due date may be earlier.
    sent_date: str
    timezone: str = "UTC"


class TokenUsageSchema(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class CommitmentsResponse(BaseModel):
    commitments: list[CommitmentSchema]
    provider: str
    model: str
    usage: TokenUsageSchema
