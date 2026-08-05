import io

from docx import Document as DocxDocument
from pypdf import PdfReader

from app.core.llm.embeddings import embedding_manager


def extract_text(filename: str, content_type: str, raw_bytes: bytes) -> str:
    """Extract raw text from an uploaded document. Raises ValueError for unsupported types."""

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if ext == "pdf" or content_type == "application/pdf":
        reader = PdfReader(io.BytesIO(raw_bytes))
        return "\n\n".join(page.extract_text() or "" for page in reader.pages).strip()

    if ext == "docx" or content_type in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ):
        doc = DocxDocument(io.BytesIO(raw_bytes))
        return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())

    if ext in ("txt", "md") or content_type in ("text/plain", "text/markdown"):
        return raw_bytes.decode("utf-8", errors="replace").strip()

    raise ValueError(f"Unsupported document type: {filename} ({content_type})")


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 100) -> list[str]:
    """Paragraph-aware greedy packing into chunks of ~chunk_size chars.

    Whole paragraphs are packed together where possible; a paragraph longer
    than chunk_size is hard-split. Each new chunk after the first carries the
    trailing `overlap` characters of the previous chunk forward, so context
    at a chunk boundary isn't lost.
    """

    normalized = text.replace("\r\n", "\n").strip()
    if not normalized:
        return []

    paragraphs = [p.strip() for p in normalized.split("\n\n") if p.strip()]

    chunks: list[str] = []
    current = ""

    for para in paragraphs:
        segments = (
            [para[i : i + chunk_size] for i in range(0, len(para), chunk_size)]
            if len(para) > chunk_size
            else [para]
        )
        for segment in segments:
            candidate = f"{current}\n\n{segment}" if current else segment
            if len(candidate) <= chunk_size:
                current = candidate
                continue

            if current:
                chunks.append(current)
            tail = current[-overlap:] if overlap > 0 else ""
            current = f"{tail}\n\n{segment}" if tail else segment

    if current:
        chunks.append(current)

    return chunks


def process_document(filename: str, content_type: str, raw_bytes: bytes) -> list[dict]:
    """Extract, chunk, and embed an uploaded document. Returns [] if it has no extractable text."""

    text = extract_text(filename, content_type, raw_bytes)
    if not text.strip():
        return []

    pieces = chunk_text(text)
    if not pieces:
        return []

    embeddings = embedding_manager.embed_batch(pieces)

    return [
        {"content": piece, "embedding": embedding}
        for piece, embedding in zip(pieces, embeddings)
    ]
