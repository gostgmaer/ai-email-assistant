from pydantic import BaseModel


class RewriteRequest(BaseModel):
    draft: str
    # Unset keeps the draft's own tone and language. A fixed default here
    # used to turn every "friendlier" rewrite professional and every
    # non-English draft into English.
    tone: str | None = None
    language: str | None = None
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