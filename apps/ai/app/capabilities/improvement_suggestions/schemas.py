from typing import Literal

from pydantic import BaseModel, Field

MAX_GROUPS = 10
MAX_EXAMPLES = 3
MAX_EXAMPLE_LENGTH = 1500


class ExampleSchema(BaseModel):
    # The AI's draft, and what the human sent instead (null if discarded).
    draft: str = Field(max_length=MAX_EXAMPLE_LENGTH)
    sent: str | None = Field(default=None, max_length=MAX_EXAMPLE_LENGTH)


class OutcomeGroupSchema(BaseModel):
    # "agent": replies written by one persona; "domain"/"category": replies
    # to one sender domain or message category.
    type: Literal["agent", "domain", "category"]
    label: str
    reviewed: int
    discarded: int
    heavily_edited: int
    # {"wrong_tone": 3, ...}: why the reviewer discarded drafts, when given.
    reasons: dict[str, int] = {}
    examples: list[ExampleSchema] = Field(default=[], max_length=MAX_EXAMPLES)


class SuggestionSchema(BaseModel):
    # 1-based number of the group it's about.
    group: int
    # A one-line instruction for the agent; ignored for other groups.
    instruction: str = ""
    # One sentence on the pattern, for the person approving it.
    rationale: str = ""


class SuggestionListSchema(BaseModel):
    suggestions: list[SuggestionSchema] = []


class ImprovementSuggestionsRequest(BaseModel):
    groups: list[OutcomeGroupSchema] = Field(min_length=1, max_length=MAX_GROUPS)


class TokenUsageSchema(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class ImprovementSuggestionsResponse(BaseModel):
    suggestions: list[SuggestionSchema]
    provider: str
    model: str
    usage: TokenUsageSchema
