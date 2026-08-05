from app.capabilities.summarize.nodes import _parse_summary


def test_parses_json_wrapped_in_markdown_code_fence():
    raw = (
        "```json\n"
        '{"summary": "Short summary.", '
        '"key_points": ["point one", "point two"]}\n'
        "```"
    )

    summary, key_points = _parse_summary(raw)

    assert summary == "Short summary."
    assert key_points == ["point one", "point two"]


def test_parses_raw_json_without_code_fence():
    raw = '{"summary": "Plain JSON.", "key_points": ["a"]}'

    summary, key_points = _parse_summary(raw)

    assert summary == "Plain JSON."
    assert key_points == ["a"]


def test_falls_back_to_raw_text_when_not_json():
    raw = "This is not JSON at all."

    summary, key_points = _parse_summary(raw)

    assert summary == "This is not JSON at all."
    assert key_points == []
