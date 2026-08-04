def extract_text(content: str | list) -> str:
    """Normalize a LangChain message ``.content`` into plain text.

    Some providers (e.g. Gemini) return content blocks instead of a
    plain string, e.g. [{"type": "text", "text": "...", ...}].
    """

    if isinstance(content, str):
        return content

    if isinstance(content, list):
        return "".join(
            block.get("text", "")
            for block in content
            if isinstance(block, dict)
        )

    return str(content)
