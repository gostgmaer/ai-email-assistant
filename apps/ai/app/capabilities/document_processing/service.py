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
    # Character offsets relative to `unit_text` below — the structural unit
    # (PDF page text, Markdown/DOCX section text, or the whole document for
    # plain text), not the document as a whole.
    start_char: int = 0
    # The text of that structural unit, used to turn start/end_char into
    # 1-based line numbers.
    unit_text: str = ""


@dataclass
class DocumentMeta:
    parser: str
    splitter: str
    chunk_size: int
    chunk_overlap: int
    page_count: int | None = None


def _split_unit(
    splitter: RecursiveCharacterTextSplitter,
    unit_text: str,
    metadata: dict[str, object],
) -> list[RawChunk]:
    docs = splitter.create_documents([unit_text], metadatas=[metadata])
    return [
        RawChunk(
            content=doc.page_content,
            metadata=metadata,
            start_char=doc.metadata.get("start_index", 0),
            unit_text=unit_text,
        )
        for doc in docs
    ]


def _split_plain_text(text: str) -> tuple[list[RawChunk], DocumentMeta]:
    chunk_size, chunk_overlap = 650, 100
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=_estimate_tokens,
        add_start_index=True,
    )
    chunks = _split_unit(splitter, text, {})
    return chunks, DocumentMeta(
        parser="plain_text",
        splitter="recursive",
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )


_MARKDOWN_HEADERS = [("#", "h1"), ("##", "h2"), ("###", "h3")]


def _split_markdown(text: str) -> tuple[list[RawChunk], DocumentMeta]:
    sections = MarkdownHeaderTextSplitter(
        headers_to_split_on=_MARKDOWN_HEADERS, strip_headers=False
    ).split_text(text)

    chunk_size, chunk_overlap = 600, 90
    secondary = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=_estimate_tokens,
        add_start_index=True,
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

        chunks.extend(_split_unit(secondary, section.page_content, metadata))

    return chunks, DocumentMeta(
        parser="markdown",
        splitter="markdown_recursive",
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )


def _split_pdf(raw_bytes: bytes) -> tuple[list[RawChunk], DocumentMeta]:
    reader = PdfReader(io.BytesIO(raw_bytes))
    chunk_size, chunk_overlap = 800, 140
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=_estimate_tokens,
        add_start_index=True,
    )

    chunks: list[RawChunk] = []
    for page_number, page in enumerate(reader.pages, start=1):
        page_text = (page.extract_text() or "").strip()
        if not page_text:
            continue
        chunks.extend(_split_unit(splitter, page_text, {"page": page_number}))

    return chunks, DocumentMeta(
        parser="pdf",
        splitter="recursive",
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        page_count=len(reader.pages),
    )


_HEADING_STYLE_RE = re.compile(r"^Heading\s*\d+$", re.IGNORECASE)


def _split_docx(raw_bytes: bytes) -> tuple[list[RawChunk], DocumentMeta]:
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

    chunk_size, chunk_overlap = 800, 120
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=_estimate_tokens,
        add_start_index=True,
    )

    chunks: list[RawChunk] = []
    for section_heading, paragraphs in sections:
        section_text = "\n\n".join(paragraphs)
        if not section_text.strip():
            continue
        metadata = {"heading": section_heading} if section_heading else {}
        chunks.extend(_split_unit(splitter, section_text, metadata))

    return chunks, DocumentMeta(
        parser="docx",
        splitter="recursive",
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )


def process_document(filename: str, content_type: str, raw_bytes: bytes) -> dict:
    """Detect the document type, split it with a structure-aware strategy, and embed
    each chunk. Returns {"chunks": [], ...} if the document has no extractable text.
    Raises ValueError for unsupported types.
    """

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "pdf" or content_type == "application/pdf":
        raw_chunks, doc_meta = _split_pdf(raw_bytes)
    elif ext == "docx" or content_type == DOCX_CONTENT_TYPE:
        raw_chunks, doc_meta = _split_docx(raw_bytes)
    elif ext == "md" or content_type == "text/markdown":
        text = raw_bytes.decode("utf-8", errors="replace").strip()
        raw_chunks, doc_meta = _split_markdown(text) if text else ([], None)
    elif ext == "txt" or content_type == "text/plain":
        text = raw_bytes.decode("utf-8", errors="replace").strip()
        raw_chunks, doc_meta = _split_plain_text(text) if text else ([], None)
    else:
        raise ValueError(f"Unsupported document type: {filename} ({content_type})")

    raw_chunks = [chunk for chunk in raw_chunks if chunk.content.strip()]
    if not raw_chunks:
        return {
            "chunks": [],
            "parser": doc_meta.parser if doc_meta else None,
            "splitter": doc_meta.splitter if doc_meta else None,
            "chunk_size": doc_meta.chunk_size if doc_meta else None,
            "chunk_overlap": doc_meta.chunk_overlap if doc_meta else None,
            "page_count": doc_meta.page_count if doc_meta else None,
        }

    embeddings = embedding_manager.embed_batch([chunk.content for chunk in raw_chunks])

    chunk_dicts = []
    for chunk, embedding in zip(raw_chunks, embeddings):
        end_char = chunk.start_char + len(chunk.content)
        chunk_dicts.append(
            {
                "content": chunk.content,
                "embedding": embedding,
                "metadata": {"source": filename, **chunk.metadata},
                # Mirrored out of metadata as top-level fields so apps/api
                # can store them in indexed columns instead of only inside
                # JSON.
                "page": chunk.metadata.get("page"),
                "section": chunk.metadata.get("heading") or chunk.metadata.get("section"),
                "chunk_type": "text",
                "token_count": _estimate_tokens(chunk.content),
                "word_count": len(chunk.content.split()),
                "character_count": len(chunk.content),
                "start_char": chunk.start_char,
                "end_char": end_char,
                "line_start": chunk.unit_text.count("\n", 0, chunk.start_char) + 1,
                "line_end": chunk.unit_text.count("\n", 0, end_char) + 1,
            }
        )

    return {
        "chunks": chunk_dicts,
        "parser": doc_meta.parser,
        "splitter": doc_meta.splitter,
        "chunk_size": doc_meta.chunk_size,
        "chunk_overlap": doc_meta.chunk_overlap,
        "page_count": doc_meta.page_count,
    }
