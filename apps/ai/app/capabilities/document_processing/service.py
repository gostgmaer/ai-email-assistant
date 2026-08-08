import csv as csv_module
import io
import json as json_module
import os
import re
import tempfile
from dataclasses import dataclass, field
from email import message_from_bytes
from email.policy import default as email_default_policy

import extract_msg
import pdfplumber
import pytesseract
from bs4 import BeautifulSoup
from langdetect import LangDetectException, detect as detect_language
from docx import Document as DocxDocument
from docx.table import Table as DocxTable
from langchain_text_splitters import (
    HTMLHeaderTextSplitter,
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter,
)
from openpyxl import load_workbook

from app.core.llm.embeddings import embedding_manager

DOCX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)
XLSX_CONTENT_TYPE = (
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)
MSG_CONTENT_TYPE = "application/vnd.ms-outlook"

# Splitters below are sized in estimated tokens, not raw characters, so the
# chunk_size/chunk_overlap values line up with the token-based chunking
# spec regardless of the embedding provider's own tokenizer.
_CHARS_PER_TOKEN = 4


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // _CHARS_PER_TOKEN)


def _format_table_markdown(rows: list[list[str | None]]) -> str:
    """Renders extracted table rows as a markdown table so row/column
    structure survives into the chunk text instead of being flattened into
    disordered inline text by plain extraction."""

    rows = [row for row in rows if any((cell or "").strip() for cell in row)]
    if not rows:
        return ""

    def cell(value: str | None) -> str:
        return (value or "").strip().replace("\n", " ").replace("|", "/")

    header, *body = rows
    lines = ["| " + " | ".join(cell(c) for c in header) + " |"]
    lines.append("| " + " | ".join("---" for _ in header) + " |")
    for row in body:
        lines.append("| " + " | ".join(cell(c) for c in row) + " |")
    return "\n".join(lines)


@dataclass
class RawChunk:
    content: str
    metadata: dict[str, object] = field(default_factory=dict)
    # Character offsets relative to `unit_text` below — the structural unit
    # (PDF page text, Markdown/HTML/DOCX section text, or the whole document
    # for plain text), not the document as a whole.
    start_char: int = 0
    # The text of that structural unit, used to turn start/end_char into
    # 1-based line numbers.
    unit_text: str = ""
    # "text" or "table" — tables are kept as one atomic chunk (splitting a
    # table mid-row would corrupt it) and never token-split.
    chunk_type: str = "text"


@dataclass
class DocumentMeta:
    parser: str
    splitter: str
    chunk_size: int
    chunk_overlap: int
    page_count: int | None = None


def _table_chunk(table_md: str, metadata: dict[str, object]) -> RawChunk:
    return RawChunk(
        content=table_md,
        metadata=metadata,
        start_char=0,
        unit_text=table_md,
        chunk_type="table",
    )


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


def _heading_metadata(section_metadata: dict[str, object]) -> dict[str, object]:
    heading = (
        section_metadata.get("h3")
        or section_metadata.get("h2")
        or section_metadata.get("h1")
    )
    path = " > ".join(
        value
        for key in ("h1", "h2", "h3")
        if (value := section_metadata.get(key))
    )
    return {k: v for k, v in {"heading": heading, "section": path}.items() if v}


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
        metadata = _heading_metadata(section.metadata)
        chunks.extend(_split_unit(secondary, section.page_content, metadata))

    return chunks, DocumentMeta(
        parser="markdown",
        splitter="markdown_recursive",
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )


_HTML_HEADERS = [("h1", "h1"), ("h2", "h2"), ("h3", "h3")]


def _split_html(raw_bytes: bytes) -> tuple[list[RawChunk], DocumentMeta]:
    soup = BeautifulSoup(raw_bytes, "lxml")

    # Tables get flattened into disordered inline text by any plain-text
    # splitter, so pull them out as their own markdown-table chunks first —
    # tagged with the nearest preceding heading, best-effort — before the
    # remaining HTML goes through header-aware text splitting.
    table_chunks: list[RawChunk] = []
    for table_tag in soup.find_all("table"):
        rows = [
            [cell.get_text() for cell in tr.find_all(["td", "th"])]
            for tr in table_tag.find_all("tr")
        ]
        table_md = _format_table_markdown(rows)
        if table_md:
            heading_tag = table_tag.find_previous(["h1", "h2", "h3"])
            metadata = {"heading": heading_tag.get_text().strip()} if heading_tag else {}
            table_chunks.append(_table_chunk(table_md, metadata))
        table_tag.decompose()

    chunk_size, chunk_overlap = 600, 90
    secondary = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=_estimate_tokens,
        add_start_index=True,
    )

    sections = HTMLHeaderTextSplitter(headers_to_split_on=_HTML_HEADERS).split_text(
        str(soup)
    )

    text_chunks: list[RawChunk] = []
    for section in sections:
        text = section.page_content.strip()
        if not text:
            continue
        metadata = _heading_metadata(section.metadata)
        text_chunks.extend(_split_unit(secondary, text, metadata))

    return text_chunks + table_chunks, DocumentMeta(
        parser="html",
        splitter="html_header_recursive",
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )


def _ocr_page(page: "pdfplumber.page.Page") -> str:
    """Rasterizes a page (via pdfplumber's pypdfium2 backend — no external
    poppler/ImageMagick dependency) and runs it through Tesseract. Used only
    when a page's text layer is empty, i.e. it's a scanned/image-only page —
    real text-layer pages never pay this cost. Best-effort: OCR is slow and
    occasionally fails on unusual page content, and an OCR failure on one
    page must not fail the whole document."""
    try:
        image = page.to_image(resolution=200).original
        return pytesseract.image_to_string(image).strip()
    except Exception:
        return ""


def _split_pdf(raw_bytes: bytes) -> tuple[list[RawChunk], DocumentMeta]:
    chunk_size, chunk_overlap = 800, 140
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=_estimate_tokens,
        add_start_index=True,
    )

    chunks: list[RawChunk] = []
    ocr_used = False
    with pdfplumber.open(io.BytesIO(raw_bytes)) as pdf:
        page_count = len(pdf.pages)
        for page_number, page in enumerate(pdf.pages, start=1):
            # Tables first: extract_tables() finds ruled/aligned tables and
            # returns them as structured rows — rendering those as markdown
            # keeps column alignment instead of pdfplumber's plain
            # extract_text() interleaving cell text with body text below.
            # Deliberately uses the default "lines" (ruled-border) detection
            # only — pdfplumber's "text"-alignment strategy was tried and
            # produces false positives, mistaking wrapped paragraph text for
            # table columns. An unruled table still isn't lost — it just
            # flows into the ordinary page-text chunk below unformatted.
            for table_rows in page.extract_tables():
                table_md = _format_table_markdown(table_rows)
                if table_md:
                    chunks.append(_table_chunk(table_md, {"page": page_number}))

            page_text = (page.extract_text() or "").strip()
            if not page_text:
                # Empty text layer almost always means a scanned/image-only
                # page rather than a genuinely blank one — OCR it rather
                # than silently contributing nothing for this page.
                page_text = _ocr_page(page)
                if page_text:
                    ocr_used = True
            if page_text:
                chunks.extend(
                    _split_unit(splitter, page_text, {"page": page_number})
                )

    return chunks, DocumentMeta(
        parser="pdf+ocr" if ocr_used else "pdf",
        splitter="recursive",
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        page_count=page_count,
    )


_HEADING_STYLE_RE = re.compile(r"^Heading\s*\d+$", re.IGNORECASE)


def _split_docx(raw_bytes: bytes) -> tuple[list[RawChunk], DocumentMeta]:
    doc = DocxDocument(io.BytesIO(raw_bytes))

    # iter_inner_content() (not the separate .paragraphs/.tables lists)
    # walks paragraphs and tables in true document order, so a table that
    # falls between two paragraphs under the same heading stays associated
    # with that heading instead of being bucketed separately at the end.
    sections: list[tuple[str | None, list[str], list[DocxTable]]] = []
    heading: str | None = None
    body: list[str] = []
    tables: list[DocxTable] = []

    for block in doc.iter_inner_content():
        if isinstance(block, DocxTable):
            tables.append(block)
            continue

        text = block.text.strip()
        if not text:
            continue

        style_name = block.style.name if block.style else ""
        if _HEADING_STYLE_RE.match(style_name):
            if heading or body or tables:
                sections.append((heading, body, tables))
            heading, body, tables = text, [], []
        else:
            body.append(text)

    if heading or body or tables:
        sections.append((heading, body, tables))

    chunk_size, chunk_overlap = 800, 120
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=_estimate_tokens,
        add_start_index=True,
    )

    chunks: list[RawChunk] = []
    for section_heading, paragraphs, section_tables in sections:
        metadata = {"heading": section_heading} if section_heading else {}

        section_text = "\n\n".join(paragraphs)
        if section_text.strip():
            chunks.extend(_split_unit(splitter, section_text, metadata))

        for table in section_tables:
            rows = [[cell.text for cell in row.cells] for row in table.rows]
            table_md = _format_table_markdown(rows)
            if table_md:
                chunks.append(_table_chunk(table_md, metadata))

    return chunks, DocumentMeta(
        parser="docx",
        splitter="recursive",
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )


def _split_csv(raw_bytes: bytes) -> tuple[list[RawChunk], DocumentMeta]:
    text = raw_bytes.decode("utf-8-sig", errors="replace")
    rows = list(csv_module.reader(io.StringIO(text)))
    rows = [row for row in rows if any(cell.strip() for cell in row)]

    # Batched, not one giant table: a large CSV shouldn't become a single
    # oversized chunk. The header repeats in every batch so each chunk is
    # independently interpretable without the others.
    batch_size = 50
    chunks: list[RawChunk] = []
    if rows:
        header, body = rows[0], rows[1:]
        for i in range(0, max(len(body), 1), batch_size):
            batch = body[i : i + batch_size]
            table_md = _format_table_markdown([header, *batch])
            if table_md:
                chunks.append(_table_chunk(table_md, {"page": (i // batch_size) + 1}))

    return chunks, DocumentMeta(
        parser="csv", splitter="table_batches", chunk_size=batch_size, chunk_overlap=0
    )


def _split_xlsx(raw_bytes: bytes) -> tuple[list[RawChunk], DocumentMeta]:
    workbook = load_workbook(io.BytesIO(raw_bytes), read_only=True, data_only=True)
    batch_size = 50

    chunks: list[RawChunk] = []
    for sheet in workbook.worksheets:
        rows = [
            [("" if cell is None else str(cell)) for cell in row]
            for row in sheet.iter_rows(values_only=True)
        ]
        rows = [row for row in rows if any(cell.strip() for cell in row)]
        if not rows:
            continue

        header, body = rows[0], rows[1:]
        for i in range(0, max(len(body), 1), batch_size):
            batch = body[i : i + batch_size]
            table_md = _format_table_markdown([header, *batch])
            if table_md:
                chunks.append(_table_chunk(table_md, {"section": sheet.title}))

    return chunks, DocumentMeta(
        parser="xlsx", splitter="table_batches", chunk_size=batch_size, chunk_overlap=0
    )


def _split_json(raw_bytes: bytes) -> tuple[list[RawChunk], DocumentMeta]:
    text = raw_bytes.decode("utf-8", errors="replace")
    try:
        data = json_module.loads(text)
    except json_module.JSONDecodeError:
        data = None

    chunk_size, chunk_overlap = 650, 100
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=_estimate_tokens,
        add_start_index=True,
    )

    if isinstance(data, list) and data and all(isinstance(item, dict) for item in data):
        # A list of records (the common shape: an API export, a table dump)
        # — one chunk per record instead of splitting mid-record, which
        # would produce chunks that are half of one record and half of the
        # next and meaningless on their own.
        chunks: list[RawChunk] = []
        for index, record in enumerate(data, start=1):
            record_text = json_module.dumps(record, indent=2, ensure_ascii=False)
            chunks.extend(_split_unit(splitter, record_text, {"page": index}))
        return chunks, DocumentMeta(
            parser="json",
            splitter="json_records",
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )

    pretty = (
        json_module.dumps(data, indent=2, ensure_ascii=False) if data is not None else text
    )
    chunks = _split_unit(splitter, pretty, {})
    return chunks, DocumentMeta(
        parser="json", splitter="recursive", chunk_size=chunk_size, chunk_overlap=chunk_overlap
    )


def _split_xml(raw_bytes: bytes) -> tuple[list[RawChunk], DocumentMeta]:
    # No special structure-awareness beyond pretty-printing — XML schemas
    # vary too widely (configs, feeds, SOAP payloads) to assume any
    # consistent heading/table shape the way HTML/Markdown have.
    soup = BeautifulSoup(raw_bytes, "xml")
    text = soup.prettify()

    chunk_size, chunk_overlap = 650, 100
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=_estimate_tokens,
        add_start_index=True,
    )
    chunks = _split_unit(splitter, text, {})
    return chunks, DocumentMeta(
        parser="xml", splitter="recursive", chunk_size=chunk_size, chunk_overlap=chunk_overlap
    )


def _html_to_text(html: str) -> str:
    return BeautifulSoup(html, "lxml").get_text("\n", strip=True)


def _split_eml(raw_bytes: bytes) -> tuple[list[RawChunk], DocumentMeta]:
    msg = message_from_bytes(raw_bytes, policy=email_default_policy)

    header_lines = [
        f"From: {msg.get('From', '')}",
        f"To: {msg.get('To', '')}",
        f"Subject: {msg.get('Subject', '')}",
        f"Date: {msg.get('Date', '')}",
    ]

    body = ""
    plain_part = msg.get_body(preferencelist=("plain",))
    if plain_part is not None:
        body = plain_part.get_content()
    else:
        html_part = msg.get_body(preferencelist=("html",))
        if html_part is not None:
            body = _html_to_text(html_part.get_content())

    text = "\n".join(header_lines) + "\n\n" + body.strip()

    chunk_size, chunk_overlap = 650, 100
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=_estimate_tokens,
        add_start_index=True,
    )
    chunks = _split_unit(splitter, text, {})
    return chunks, DocumentMeta(
        parser="eml", splitter="recursive", chunk_size=chunk_size, chunk_overlap=chunk_overlap
    )


def _split_msg(raw_bytes: bytes) -> tuple[list[RawChunk], DocumentMeta]:
    # extract_msg's Message needs a real path (the .msg format is an OLE
    # compound file, not something it reads from an in-memory buffer), so
    # round-trip through a temp file.
    fd, tmp_path = tempfile.mkstemp(suffix=".msg")
    try:
        with os.fdopen(fd, "wb") as tmp_file:
            tmp_file.write(raw_bytes)

        msg = extract_msg.Message(tmp_path)
        try:
            header_lines = [
                f"From: {msg.sender or ''}",
                f"To: {msg.to or ''}",
                f"Subject: {msg.subject or ''}",
                f"Date: {msg.date or ''}",
            ]
            body = (msg.body or "").strip()
        finally:
            msg.close()
    finally:
        os.unlink(tmp_path)

    text = "\n".join(header_lines) + "\n\n" + body

    chunk_size, chunk_overlap = 650, 100
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=_estimate_tokens,
        add_start_index=True,
    )
    chunks = _split_unit(splitter, text, {})
    return chunks, DocumentMeta(
        parser="msg", splitter="recursive", chunk_size=chunk_size, chunk_overlap=chunk_overlap
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
    elif ext in ("html", "htm") or content_type == "text/html":
        raw_chunks, doc_meta = _split_html(raw_bytes)
    elif ext == "md" or content_type == "text/markdown":
        text = raw_bytes.decode("utf-8", errors="replace").strip()
        raw_chunks, doc_meta = _split_markdown(text) if text else ([], None)
    elif ext == "txt" or content_type == "text/plain":
        text = raw_bytes.decode("utf-8", errors="replace").strip()
        raw_chunks, doc_meta = _split_plain_text(text) if text else ([], None)
    elif ext == "csv" or content_type == "text/csv":
        raw_chunks, doc_meta = _split_csv(raw_bytes)
    elif ext == "xlsx" or content_type == XLSX_CONTENT_TYPE:
        raw_chunks, doc_meta = _split_xlsx(raw_bytes)
    elif ext == "json" or content_type == "application/json":
        raw_chunks, doc_meta = _split_json(raw_bytes)
    elif ext == "xml" or content_type in ("application/xml", "text/xml"):
        raw_chunks, doc_meta = _split_xml(raw_bytes)
    elif ext == "eml" or content_type == "message/rfc822":
        raw_chunks, doc_meta = _split_eml(raw_bytes)
    elif ext == "msg" or content_type == MSG_CONTENT_TYPE:
        raw_chunks, doc_meta = _split_msg(raw_bytes)
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
            "language": None,
        }

    # BCP-47/ISO 639-1 code from the first ~1000 chars — enough for
    # langdetect's statistical model without paying to scan the whole
    # document. Best-effort: langdetect raises on text with no detectable
    # language features (e.g. a document that's almost entirely numbers/
    # symbols), which just means "not detectable," not an error worth
    # failing the whole upload over.
    sample_text = " ".join(chunk.content for chunk in raw_chunks[:3])[:1000]
    try:
        language = detect_language(sample_text)
    except LangDetectException:
        language = None

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
                "chunk_type": chunk.chunk_type,
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
        "language": language,
    }
