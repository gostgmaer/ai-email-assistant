from pydantic import BaseModel
from pydantic import EmailStr


class EmailMessageSchema(BaseModel):
    name: str
    email: EmailStr
    content: str


class ContactFactsSchema(BaseModel):
    role: str | None = None
    company: str | None = None
    summary: str
    commitments: list[str] = []


class TokenUsageSchema(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class ContactMemoryRequest(BaseModel):
    subject: str
    thread: list[EmailMessageSchema]


class ContactMemoryResponse(BaseModel):
    facts: ContactFactsSchema
    embedding: list[float]
    provider: str
    model: str
    usage: TokenUsageSchema
