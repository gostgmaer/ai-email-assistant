from pydantic import BaseModel
from pydantic import EmailStr

from app.capabilities.classify.schemas import ClassificationSchema
from app.capabilities.extract.schemas import ExtractionSchema
from app.capabilities.reply.schemas import TokenUsageSchema


class EmailMessageSchema(BaseModel):
    name: str
    email: EmailStr
    content: str


class ProcessRequest(BaseModel):
    subject: str
    thread: list[EmailMessageSchema]
    instruction: str | None = None


class ProcessResponse(BaseModel):
    classification: ClassificationSchema
    extraction: ExtractionSchema

    summary: str

    draft: str

    provider: str
    model: str

    usage: TokenUsageSchema