from pydantic import BaseModel, Field

# apps/api sends at most 8 search hits; the ceiling leaves room without
# letting one request carry an unbounded prompt.
MAX_SOURCES = 12


class AnswerSourceSchema(BaseModel):
    n: int = Field(ge=1)
    subject: str
    sender: str
    date: str
    content: str = Field(max_length=4000)


class AnswerRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    # ISO date (YYYY-MM-DD) in the user's time zone, so "next" and "last"
    # in the question can be interpreted.
    today: str
    sources: list[AnswerSourceSchema] = Field(max_length=MAX_SOURCES)


class TokenUsageSchema(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class AnswerResponse(BaseModel):
    answer: str
    # Source numbers the answer cites, in order of first use. Only numbers
    # that were in the request.
    citations: list[int]
    found: bool
    provider: str
    model: str
    usage: TokenUsageSchema
