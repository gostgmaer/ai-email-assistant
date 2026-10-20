from pydantic import BaseModel
from pydantic import EmailStr


class EmailMessageSchema(BaseModel):
    name: str
    email: EmailStr
    content: str


class ClassificationSchema(BaseModel):
    category: str
    priority: str
    sentiment: str
    spam: bool
    # ISO 639-1 code (e.g. "en", "es") for the language the email is
    # written in — best-effort guess from the LLM, not a dedicated
    # language-detection model.
    language: str
    contains_pii: bool
    # Empty when contains_pii is false. Free-text categories (e.g. "email
    # address", "phone number", "SSN") rather than a fixed enum, matching
    # category/priority/sentiment's existing loosely-typed convention on
    # the apps/api side.
    pii_types: list[str]
    # Whether the most recent message actually calls for a reply from the
    # recipient. Defaults to True so a model that omits it can't silently
    # suppress replies; apps/api skips reply generation when it's False.
    needs_reply: bool = True
    # One short phrase on why (e.g. "asks for a quote", "thank-you only").
    reply_reason: str = ""


class TokenUsageSchema(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class ClassifyRequest(BaseModel):
    subject: str
    thread: list[EmailMessageSchema]


class ClassifyResponse(BaseModel):
    classification: ClassificationSchema
    provider: str
    model: str
    usage: TokenUsageSchema