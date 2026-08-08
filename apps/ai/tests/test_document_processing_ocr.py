import io

from pypdf import PdfWriter

from app.capabilities.document_processing.service import _ocr_page, _split_pdf


def _blank_pdf_bytes() -> bytes:
    """A single blank page — pdfplumber's text layer for this is empty,
    the same shape as a scanned/image-only page (no embedded text)."""
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def test_split_pdf_falls_back_to_ocr_when_text_layer_is_empty(monkeypatch):
    monkeypatch.setattr(
        "app.capabilities.document_processing.service.pytesseract.image_to_string",
        lambda image: "Scanned invoice #4471",
    )

    chunks, meta = _split_pdf(_blank_pdf_bytes())

    assert meta.parser == "pdf+ocr"
    assert any("Scanned invoice #4471" in chunk.content for chunk in chunks)


def test_split_pdf_stays_plain_pdf_when_ocr_finds_nothing(monkeypatch):
    monkeypatch.setattr(
        "app.capabilities.document_processing.service.pytesseract.image_to_string",
        lambda image: "",
    )

    chunks, meta = _split_pdf(_blank_pdf_bytes())

    assert meta.parser == "pdf"
    assert chunks == []


def test_ocr_page_is_best_effort_and_never_raises(monkeypatch):
    def boom(image):
        raise RuntimeError("tesseract not installed")

    monkeypatch.setattr(
        "app.capabilities.document_processing.service.pytesseract.image_to_string",
        boom,
    )

    import pdfplumber

    with pdfplumber.open(io.BytesIO(_blank_pdf_bytes())) as pdf:
        assert _ocr_page(pdf.pages[0]) == ""
