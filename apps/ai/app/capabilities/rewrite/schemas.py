from pydantic import BaseModel


class RewriteRequest(BaseModel):
    draft: str
    tone: str = "professional"
    language: str = "en"
    instruction: str | None = None


class TokenUsageSchema(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class RewriteResponse(BaseModel):
    rewritten_draft: str
    provider: str
    model: str
    usage: TokenUsageSchema