"""The "write like this user" section for reply and rewrite prompts, from
the profile the style_profile capability learned (and the user may have
edited). It's the user's own settings, so it goes in the system message,
but every value is still flattened to one short line."""

_LENGTH_HINT = {
    "short": "short — a few sentences",
    "medium": "medium — one or two short paragraphs",
    "long": "long and detailed",
}


def _line(value: object, limit: int = 120) -> str:
    return " ".join(str(value or "").split())[:limit]


def writing_style_instruction(profile: dict | None) -> str | None:
    if not profile:
        return None

    lines: list[str] = []

    greeting = _line(profile.get("greeting"), 60)
    if greeting:
        lines.append(
            f'Greeting: "{greeting}" ({{name}} stands for the recipient\'s first name).'
        )

    sign_off = _line(profile.get("sign_off"), 60)
    if sign_off:
        lines.append(f'Sign-off: "{sign_off}"')

    formality = _line(profile.get("formality"), 20)
    if formality:
        lines.append(f"Formality: {formality}.")

    length = _line(profile.get("length"), 20)
    if length:
        words = profile.get("median_words")
        hint = _LENGTH_HINT.get(length, length)
        if isinstance(words, int) and words > 0:
            hint += f" (their emails are typically about {words} words)"
        lines.append(f"Length: {hint}.")

    language = _line(profile.get("language"), 40)
    if language:
        lines.append(f"Usual language: {language}, unless the thread is in another language.")

    phrases = [
        _line(phrase, 80)
        for phrase in (profile.get("common_phrases") or [])[:8]
        if _line(phrase, 80)
    ]
    if phrases:
        quoted = ", ".join(f'"{phrase}"' for phrase in phrases)
        lines.append(f"Phrases they often use (only where they fit naturally): {quoted}.")

    notes = _line(profile.get("notes"), 300)
    if notes:
        lines.append(f"Also: {notes}")

    if not lines:
        return None

    return (
        "Write the way this user writes their own emails:\n"
        + "\n".join(f"- {line}" for line in lines)
        + "\n- An explicitly requested tone or instruction takes precedence over this style."
    )
