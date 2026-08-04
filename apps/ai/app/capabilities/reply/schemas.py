from pydantic import BaseModel, EmailStr, Field


class EmailMessageSchema(BaseModel):
    role: str = Field("user", examples=["user"])
    name: str = Field(..., examples=["John"])
    email: EmailStr
    content: str


class ReplyRequest(BaseModel):
    subject: str
    thread: list[EmailMessageSchema]
    tone: str = "professional"
    language: str = "en"
    instruction: str | None = None


class TokenUsageResponse(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class ReplyResponse(BaseModel):
    draft: str
    provider: str
    model: str
    usage: TokenUsageResponse