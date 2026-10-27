import httpx
from fastapi import APIRouter, HTTPException
from file_upload_sdk import FileUploadError

from app.capabilities.document_processing.schemas import (
    EmbedBatchRequest,
    EmbedBatchResponse,
    EmbedQueryRequest,
    EmbedQueryResponse,
    ProcessDocumentRequest,
    ProcessDocumentResponse,
)
from app.capabilities.document_processing.service import process_document
from app.core.file_service_client import file_service_client
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
    payload: ProcessDocumentRequest,
) -> ProcessDocumentResponse:
    """Downloads the file from file-upload-service itself (apps/api only
    uploaded it and enqueued this request — it never sees the file content),
    then extracts, chunks, and embeds it. Stateless otherwise."""

    try:
        raw_bytes = await file_service_client.download(
            file_id=payload.file_id,
            user_id=payload.uploaded_by,
            user_email=payload.user_email,
            user_role=payload.user_role,
            tenant_id=payload.tenant_id,
        )
    except FileUploadError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Could not download file {payload.file_id} from file-upload-service: {exc.status_code} {exc.message}",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"file-upload-service is unreachable: {exc}",
        ) from exc

    try:
        result = process_document(
            filename=payload.filename,
            content_type=payload.content_type,
            raw_bytes=raw_bytes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return ProcessDocumentResponse(
        **result,
        provider=embedding_manager.provider,
        model=embedding_manager.model,
    )


@router.post(
    "/embed",
    response_model=EmbedQueryResponse,
)
async def embed_query_route(payload: EmbedQueryRequest) -> EmbedQueryResponse:
    """Embed a free-text query for similarity search against stored document chunks."""

    try:
        embedding = embedding_manager.embed(payload.text)
    except Exception as error:
        _raise_if_rate_limited(error)
        raise

    return EmbedQueryResponse(
        embedding=embedding,
        provider=embedding_manager.provider,
        model=embedding_manager.model,
    )


@router.post(
    "/embed-batch",
    response_model=EmbedBatchResponse,
)
async def embed_batch_route(payload: EmbedBatchRequest) -> EmbedBatchResponse:
    """Embed several texts in one provider call, results in request order."""

    try:
        embeddings = embedding_manager.embed_batch(payload.texts)
    except Exception as error:
        _raise_if_rate_limited(error)
        raise

    return EmbedBatchResponse(
        embeddings=embeddings,
        provider=embedding_manager.provider,
        model=embedding_manager.model,
    )


def _raise_if_rate_limited(error: Exception) -> None:
    """The provider's quota is a "try again later", not a server fault:
    report it as 429 so apps/api can back off instead of retrying into the
    same limit. Matched on the message because langchain wraps the Google
    error in its own (private) exception type."""

    message = str(error)
    if "RESOURCE_EXHAUSTED" in message or "429" in message:
        raise HTTPException(
            status_code=429,
            detail="Embedding provider quota exceeded; try again shortly.",
        ) from error
