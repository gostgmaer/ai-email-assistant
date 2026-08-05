from fastapi import APIRouter, File, HTTPException, UploadFile

from app.capabilities.document_processing.schemas import (
    EmbedQueryRequest,
    EmbedQueryResponse,
    ProcessDocumentResponse,
)
from app.capabilities.document_processing.service import process_document
from app.core.llm.embeddings import embedding_manager

router = APIRouter(
    prefix="/documents",
    tags=["Documents"],
)


@router.post(
    "/process",
    response_model=ProcessDocumentResponse,
)
async def process_document_route(
    file: UploadFile = File(...),
) -> ProcessDocumentResponse:
    """Extract, chunk, and embed an uploaded document. Stateless — apps/api owns storage."""

    raw_bytes = await file.read()

    try:
        chunks = process_document(
            filename=file.filename or "document",
            content_type=file.content_type or "application/octet-stream",
            raw_bytes=raw_bytes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return ProcessDocumentResponse(
        chunks=chunks,
        provider=embedding_manager.provider,
        model=embedding_manager.model,
    )


@router.post(
    "/embed",
    response_model=EmbedQueryResponse,
)
async def embed_query_route(payload: EmbedQueryRequest) -> EmbedQueryResponse:
    """Embed a free-text query for similarity search against stored document chunks."""

    embedding = embedding_manager.embed(payload.text)

    return EmbedQueryResponse(
        embedding=embedding,
        provider=embedding_manager.provider,
        model=embedding_manager.model,
    )
