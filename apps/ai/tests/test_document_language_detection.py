from app.capabilities.document_processing.service import process_document


def test_process_document_detects_language_from_plain_text():
    text = (
        "This quarterly report summarizes our progress across the "
        "engineering, sales, and marketing teams for the past three months."
    ).encode("utf-8")

    result = process_document(
        filename="report.txt", content_type="text/plain", raw_bytes=text
    )

    assert result["language"] == "en"


def test_process_document_language_is_none_when_there_is_no_extractable_text():
    result = process_document(
        filename="empty.txt", content_type="text/plain", raw_bytes=b""
    )

    assert result["chunks"] == []
    assert result["language"] is None
