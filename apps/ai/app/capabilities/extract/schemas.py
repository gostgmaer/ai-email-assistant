from pydantic import BaseModel
from pydantic import EmailStr


class EmailMessageSchema(BaseModel):
    name: str
    email: EmailStr
    content: str


class ExtractionSchema(BaseModel):
    people: list[str]
    emails: list[str]
    phones: list[str]
    companies: list[str]
    dates: list[str]
    urls: list[str]
    tasks: list[str]
    meeting_requests: list[str]


class TokenUsageSchema(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class ExtractRequest(BaseModel):
    subject: str
    thread: list[EmailMessageSchema]


class ExtractResponse(BaseModel):
    extraction: ExtractionSchema
    provider: str
    model: str
    usage: TokenUsageSchema