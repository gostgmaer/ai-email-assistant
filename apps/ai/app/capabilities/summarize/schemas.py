from pydantic import BaseModel, EmailStr


class EmailMessageSchema(BaseModel):
    name: str
    email: EmailStr
    content: str


class ActionItemSchema(BaseModel):
    task: str
    owner: str | None = None
    due_date: str | None = None


class SummarizeRequest(BaseModel):
    subject: str
    thread: list[EmailMessageSchema]


class TokenUsageSchema(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class SummarizeResponse(BaseModel):
    summary: str
    key_points: list[str]
    action_items: list[ActionItemSchema]
    important_dates: list[str]
    participants: list[str]
    decisions_made: list[str]
    provider: str
    model: str
    usage: TokenUsageSchema