from pydantic import BaseModel, Field


class DocumentChunkSchema(BaseModel):
    content: str
    embedding: list[float]
    metadata: dict[str, object] = Field(default_factory=dict)
    page: int | None = None
    section: str | None = None
    chunk_type: str = "text"
    token_count: int
    word_count: int
    character_count: int
    start_char: int
    end_char: int
    line_start: int
    line_end: int


class ProcessDocumentResponse(BaseModel):
    chunks: list[DocumentChunkSchema]
    provider: str
    model: str
    parser: str | None = None
    splitter: str | None = None
    chunk_size: int | None = None
    chunk_overlap: int | None = None
    page_count: int | None = None


class EmbedQueryRequest(BaseModel):
    text: str


class EmbedQueryResponse(BaseModel):
    embedding: list[float]
    provider: str
    model: str
