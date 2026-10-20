from pydantic import BaseModel, EmailStr, Field


class EmailMessageSchema(BaseModel):
    role: str = Field("user", examples=["user"])
    name: str = Field(..., examples=["John"])
    email: EmailStr
    content: str


class SenderProfile(BaseModel):
    """Who the reply is written as — the mailbox owner's own profile."""

    name: str | None = Field(None, max_length=120)
    job_title: str | None = Field(None, max_length=120)
    company: str | None = Field(None, max_length=120)
    # A signature is appended to the reply after generation (never written
    # by the model), so the model must not sign with a name block itself.
    has_signature: bool = False


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
    sender_profile: SenderProfile | None = None


class TokenUsageResponse(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class ReplyResponse(BaseModel):
    draft: str
    provider: str
    model: str
    usage: TokenUsageResponse