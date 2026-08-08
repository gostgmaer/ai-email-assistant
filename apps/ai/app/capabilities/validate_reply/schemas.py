from pydantic import BaseModel
from pydantic import EmailStr


class EmailMessageSchema(BaseModel):
    name: str
    email: EmailStr
    content: str


class ReplyValidationSchema(BaseModel):
    addresses_thread: bool
    # Empty when addresses_thread is true and nothing else is notable.
    # Free-text, not a fixed enum — same loosely-typed convention as
    # ClassificationSchema's category/priority/sentiment.
    concerns: list[str]


class TokenUsageSchema(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class ValidateReplyRequest(BaseModel):
    subject: str
    thread: list[EmailMessageSchema]
    draft_reply: str


class ValidateReplyResponse(BaseModel):
    validation: ReplyValidationSchema
    provider: str
    model: str
    usage: TokenUsageSchema
