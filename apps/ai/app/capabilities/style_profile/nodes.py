import re

from langchain_core.messages import HumanMessage, SystemMessage

from app.core.workflow.executor import llm_executor
from app.core.workflow.message_builder import UNTRUSTED_CONTENT_RULES, defuse
from app.core.workflow.prompt_loader import prompt_loader
from app.core.workflow.response_parser import ResponseParser

from .schemas import MAX_SAMPLE_LENGTH, StyleProfileSchema
from .state import StyleProfileState

MAX_PHRASES = 8
MAX_PHRASE_LENGTH = 80
MAX_SHORT_FIELD = 60
MAX_NOTES = 300

_EMAIL_RE = re.compile(r"\S+@\S+")
_URL_RE = re.compile(r"(https?://|www\.)\S+", re.IGNORECASE)
_LONG_NUMBER_RE = re.compile(r"\d[\d\s().+-]{3,}\d")
_DIGIT_RE = re.compile(r"\d")
_NAME_TOKEN = "{name}"
# Never treated as a name, even when someone is called that: they're the
# words a greeting or sign-off is made of.
_NOT_NAMES = {
    "hi", "hello", "hey", "dear", "team", "all", "everyone", "thanks",
    "thank", "regards", "best", "cheers", "kind", "warm", "sincerely",
    "info", "support", "sales", "admin", "contact", "mail", "hr", "jobs",
    "careers", "the", "and", "of", "for", "me", "you",
}


def load_prompt(state: StyleProfileState) -> StyleProfileState:
    """Load the style-profile prompt."""

    state["system_prompt"] = prompt_loader.load("style_profile")

    return state


def build_messages(state: StyleProfileState) -> StyleProfileState:
    """Every sample as its own delimited <email> block: the user wrote
    them, but they can still quote or paste other people's text."""

    messages = [SystemMessage(content=state["system_prompt"] + UNTRUSTED_CONTENT_RULES)]
    for index, sample in enumerate(state["samples"], start=1):
        messages.append(HumanMessage(content=(
            f'<email index="{index}">\n'
            f"{defuse(sample[:MAX_SAMPLE_LENGTH])}\n"
            "</email>"
        )))

    state["messages"] = messages

    return state


def extract_profile(state: StyleProfileState) -> StyleProfileState:
    """Run structured extraction of the user's style."""

    state["response"] = llm_executor.invoke_structured(
        messages=state["messages"],
        schema=StyleProfileSchema,
    )

    return state


def parse_profile(state: StyleProfileState) -> StyleProfileState:
    """Scrub the model's profile of anything personal before it's stored."""

    response = state["response"]

    state["profile"] = scrub_profile(response.model_dump(), state.get("names") or [])
    state["provider"] = llm_executor.provider
    state["model"] = llm_executor.model
    state["usage"] = ResponseParser.usage(response)

    return state


def scrub_profile(profile: dict, names: list[str]) -> dict:
    """The prompt asks for a generic profile; this makes sure of it. Every
    known name (whole or any part of it) becomes {name}, email addresses and
    links are removed (a phrase containing one, or a name, is dropped), a greeting,
    sign-off or phrase with a digit in it is dropped, and long numbers in the notes are blanked."""

    name_re = _name_pattern(names)

    def clean(value: object, limit: int) -> str | None:
        if not isinstance(value, str):
            return None
        text = _URL_RE.sub("", _EMAIL_RE.sub("", value))
        if name_re:
            text = name_re.sub("{name}", text)
        text = " ".join(text.split())[:limit]
        return text or None

    def short(value: object) -> str | None:
        text = clean(value, MAX_SHORT_FIELD)
        return None if text is None or _DIGIT_RE.search(text) else text

    phrases: list[str] = []
    for phrase in profile.get("common_phrases") or []:
        # What's left of a phrase around a link or address means nothing.
        if not isinstance(phrase, str) or _EMAIL_RE.search(phrase) or _URL_RE.search(phrase):
            continue
        text = clean(phrase, MAX_PHRASE_LENGTH)
        # A reused phrase that names someone or a company is a detail, not
        # a habit — including names nobody told us about, which show up as
        # a capitalised word after the first ("…how EasyDev can assist").
        if text and (_NAME_TOKEN in text or _has_proper_noun(text)):
            continue
        if text and not _DIGIT_RE.search(text) and text not in phrases:
            phrases.append(text)
        if len(phrases) == MAX_PHRASES:
            break

    notes = clean(profile.get("notes"), MAX_NOTES)
    if notes:
        notes = _LONG_NUMBER_RE.sub("…", notes)

    return {
        "greeting": short(profile.get("greeting")),
        "sign_off": short(profile.get("sign_off")),
        "formality": profile.get("formality") or "neutral",
        "length": profile.get("length") or "medium",
        "language": clean(profile.get("language"), 40),
        "common_phrases": phrases,
        "notes": notes,
    }


def _has_proper_noun(phrase: str) -> bool:
    """A capitalised word anywhere but first, other than "I" ("I'm", "I'll")."""
    for word in phrase.split()[1:]:
        word = word.strip(".,!?;:\"'()")
        if word[:1].isupper() and not re.fullmatch(r"I('\w+)?", word):
            return True
    return False


def _name_pattern(names: list[str]) -> re.Pattern | None:
    parts: set[str] = set()
    for name in names:
        for part in re.split(r"[\s,.'\"]+", name or ""):
            # Single letters (initials) would blank out ordinary words.
            if len(part) >= 2 and not part.isdigit() and part.lower() not in _NOT_NAMES:
                parts.add(part)
    if not parts:
        return None
    alternatives = "|".join(re.escape(part) for part in sorted(parts, key=len, reverse=True))
    return re.compile(rf"(?<!\w)(?:{alternatives})(?!\w)", re.IGNORECASE)
