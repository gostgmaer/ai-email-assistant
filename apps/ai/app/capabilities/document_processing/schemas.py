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


class ProcessDocumentRequest(BaseModel):
    """File reference, not raw bytes — this service downloads the file
    itself from file-upload-service using the same identity it was
    uploaded under, rather than apps/api proxying the bytes through."""

    file_id: str
    filename: str
    content_type: str
    uploaded_by: str
    user_email: str = ""
    user_role: str = "anonymous"
    tenant_id: str | None = None


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
