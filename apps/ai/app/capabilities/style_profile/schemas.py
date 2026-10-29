from typing import Literal

from pydantic import BaseModel, Field

# apps/api sends the user's last 50 sent messages, quoted history stripped.
MAX_SAMPLES = 50
MAX_SAMPLE_LENGTH = 3000


class StyleProfileSchema(BaseModel):
    """How the user writes. Generic by design: no names, numbers or details
    from the emails it was learned from."""

    # e.g. "Hi {name}," — {name} stands for the recipient.
    greeting: str | None = None
    # e.g. "Thanks," or "Best regards," — without the user's name.
    sign_off: str | None = None
    formality: Literal["casual", "neutral", "formal"] = "neutral"
    length: Literal["short", "medium", "long"] = "medium"
    # Language the user usually writes in, e.g. "English".
    language: str | None = None
    common_phrases: list[str] = []
    # One or two sentences on anything else distinctive.
    notes: str | None = None


class StyleProfileRequest(BaseModel):
    samples: list[str] = Field(min_length=1, max_length=MAX_SAMPLES)
    # Names of the user and the people they wrote to. Removed from the
    # profile even if the model copies one in.
    names: list[str] = Field(default=[], max_length=500)


class TokenUsageSchema(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class StyleProfileResponse(BaseModel):
    profile: StyleProfileSchema
    provider: str
    model: str
    usage: TokenUsageSchema
