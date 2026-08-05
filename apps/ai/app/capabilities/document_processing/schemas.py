from pydantic import BaseModel, Field


class DocumentChunkSchema(BaseModel):
    content: str
    embedding: list[float]
    metadata: dict[str, object] = Field(default_factory=dict)


class ProcessDocumentResponse(BaseModel):
    chunks: list[DocumentChunkSchema]
    provider: str
    model: str


class EmbedQueryRequest(BaseModel):
    text: str


class EmbedQueryResponse(BaseModel):
    embedding: list[float]
    provider: str
    model: str
