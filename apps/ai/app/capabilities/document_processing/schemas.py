from pydantic import BaseModel


class DocumentChunkSchema(BaseModel):
    content: str
    embedding: list[float]


class ProcessDocumentResponse(BaseModel):
    chunks: list[DocumentChunkSchema]
    provider: str
    model: str
