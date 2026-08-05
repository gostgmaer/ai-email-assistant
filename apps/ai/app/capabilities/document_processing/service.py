import io
import re
from dataclasses import dataclass, field

from docx import Document as DocxDocument
from langchain_text_splitters import (
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter,
)
from pypdf import PdfReader

from app.core.llm.embeddings import embedding_manager

DOCX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)

# Splitters below are sized in estimated tokens, not raw characters, so the
# chunk_size/chunk_overlap values line up with the token-based chunking
# spec regardless of the embedding provider's own tokenizer.
_CHARS_PER_TOKEN = 4


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // _CHARS_PER_TOKEN)


@dataclass
class RawChunk:
    content: str
    metadata: dict[str, object] = field(default_factory=dict)


def _split_plain_text(text: str) -> list[RawChunk]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=650, chunk_overlap=100, length_function=_estimate_tokens
    )
    return [RawChunk(content=piece) for piece in splitter.split_text(text)]


_MARKDOWN_HEADERS = [("#", "h1"), ("##", "h2"), ("###", "h3")]


def _split_markdown(text: str) -> list[RawChunk]:
    sections = MarkdownHeaderTextSplitter(
        headers_to_split_on=_MARKDOWN_HEADERS, strip_headers=False
    ).split_text(text)

    secondary = RecursiveCharacterTextSplitter(
        chunk_size=600, chunk_overlap=90, length_function=_estimate_tokens
    )

    chunks: list[RawChunk] = []
    for section in sections:
        heading = (
            section.metadata.get("h3")
            or section.metadata.get("h2")
            or section.metadata.get("h1")
        )
        path = " > ".join(
            value
            for key in ("h1", "h2", "h3")
            if (value := section.metadata.get(key))
        )
        metadata = {k: v for k, v in {"heading": heading, "section": path}.items() if v}

        for piece in secondary.split_text(section.page_content):
            chunks.append(RawChunk(content=piece, metadata=metadata))

    return chunks


def _split_pdf(raw_bytes: bytes) -> list[RawChunk]:
    reader = PdfReader(io.BytesIO(raw_bytes))
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800, chunk_overlap=140, length_function=_estimate_tokens
    )

    chunks: list[RawChunk] = []
    for page_number, page in enumerate(reader.pages, start=1):
        page_text = (page.extract_text() or "").strip()
        if not page_text:
            continue
        for piece in splitter.split_text(page_text):
            chunks.append(RawChunk(content=piece, metadata={"page": page_number}))

    return chunks


_HEADING_STYLE_RE = re.compile(r"^Heading\s*\d+$", re.IGNORECASE)


def _split_docx(raw_bytes: bytes) -> list[RawChunk]:
    doc = DocxDocument(io.BytesIO(raw_bytes))

    sections: list[tuple[str | None, list[str]]] = []
    heading: str | None = None
    body: list[str] = []

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue

        style_name = para.style.name if para.style else ""
        if _HEADING_STYLE_RE.match(style_name):
            if heading or body:
                sections.append((heading, body))
            heading, body = text, []
        else:
            body.append(text)

    if heading or body:
        sections.append((heading, body))

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800, chunk_overlap=120, length_function=_estimate_tokens
    )

    chunks: list[RawChunk] = []
    for section_heading, paragraphs in sections:
        section_text = "\n\n".join(paragraphs)
        if not section_text.strip():
            continue
        metadata = {"heading": section_heading} if section_heading else {}
        for piece in splitter.split_text(section_text):
            chunks.append(RawChunk(content=piece, metadata=metadata))

    return chunks


def process_document(filename: str, content_type: str, raw_bytes: bytes) -> list[dict]:
    """Detect the document type, split it with a structure-aware strategy, and embed
    each chunk. Returns [] if the document has no extractable text. Raises ValueError
    for unsupported types.
    """

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "pdf" or content_type == "application/pdf":
        raw_chunks = _split_pdf(raw_bytes)
    elif ext == "docx" or content_type == DOCX_CONTENT_TYPE:
        raw_chunks = _split_docx(raw_bytes)
    elif ext == "md" or content_type == "text/markdown":
        text = raw_bytes.decode("utf-8", errors="replace").strip()
        raw_chunks = _split_markdown(text) if text else []
    elif ext == "txt" or content_type == "text/plain":
        text = raw_bytes.decode("utf-8", errors="replace").strip()
        raw_chunks = _split_plain_text(text) if text else []
    else:
        raise ValueError(f"Unsupported document type: {filename} ({content_type})")

    raw_chunks = [chunk for chunk in raw_chunks if chunk.content.strip()]
    if not raw_chunks:
        return []

    embeddings = embedding_manager.embed_batch([chunk.content for chunk in raw_chunks])

    return [
        {
            "content": chunk.content,
            "embedding": embedding,
            "metadata": {"source": filename, **chunk.metadata},
        }
        for chunk, embedding in zip(raw_chunks, embeddings)
    ]
