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
    # AI Agents (v2.0 §4): a persona's system prompt, replacing the default
    # reply.md prompt entirely when set. Not appended/merged with the
    # default — an agent persona is meant to fully define how that account
    # replies, not layer on top of the generic one.
    system_prompt_override: str | None = None


class TokenUsageResponse(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class ReplyResponse(BaseModel):
    draft: str
    provider: str
    model: str
    usage: TokenUsageResponse