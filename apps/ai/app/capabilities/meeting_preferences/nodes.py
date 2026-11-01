import re
from datetime import date
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from langchain_core.messages import HumanMessage, SystemMessage

from app.core.workflow.executor import llm_executor
from app.core.workflow.message_builder import UNTRUSTED_CONTENT_RULES, defuse
from app.core.workflow.prompt_loader import prompt_loader
from app.core.workflow.response_parser import ResponseParser

from .schemas import MeetingPreferencesSchema
from .state import MeetingPreferencesState

MIN_DURATION = 15
MAX_DURATION = 240
DEFAULT_DURATION = 30
MAX_TITLE_LENGTH = 80
PARTS_OF_DAY = {"morning", "afternoon", "any"}

_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def load_prompt(state: MeetingPreferencesState) -> MeetingPreferencesState:
    """Load the meeting-preferences prompt."""

    state["system_prompt"] = prompt_loader.load("meeting_preferences")

    return state


def build_messages(state: MeetingPreferencesState) -> MeetingPreferencesState:
    """The dates it's read against are ours, so they go in the system
    message; the request was read from the email, so both are untrusted."""

    system = (
        f"{state['system_prompt']}{UNTRUSTED_CONTENT_RULES}\n\n"
        f"Current date and time: {state['now']} ({state['timezone']})."
    )
    state["messages"] = [
        SystemMessage(content=system),
        HumanMessage(content=(
            "<email>\n"
            f"Request: {defuse(state['description'])}\n\n"
            f"{defuse(state['content'])}\n"
            "</email>"
        )),
    ]

    return state


def extract_preferences(state: MeetingPreferencesState) -> MeetingPreferencesState:
    """Run structured extraction of what the request asks for."""

    state["response"] = llm_executor.invoke_structured(
        messages=state["messages"],
        schema=MeetingPreferencesSchema,
    )

    return state


def parse_preferences(state: MeetingPreferencesState) -> MeetingPreferencesState:
    """Keep only values the slot search can trust."""

    response = state["response"]

    state["preferences"] = clean_preferences(response.model_dump(), state["today"])
    state["provider"] = llm_executor.provider
    state["model"] = llm_executor.model
    state["usage"] = ResponseParser.usage(response)

    return state


def clean_preferences(preferences: dict, today: str) -> dict:
    """A bad value means "no preference", never a failed request: a date in
    the past, an unknown time zone or a nonsense length is simply dropped."""

    earliest = _future_date(preferences.get("earliest_date"), today)
    latest = _future_date(preferences.get("latest_date"), today)
    if earliest and latest and latest < earliest:
        latest = earliest

    duration = preferences.get("duration_minutes")
    if not isinstance(duration, int) or not MIN_DURATION <= duration <= MAX_DURATION:
        duration = DEFAULT_DURATION

    part = preferences.get("part_of_day")
    time = preferences.get("preferred_time")

    return {
        "title": " ".join(str(preferences.get("title") or "").split())[:MAX_TITLE_LENGTH],
        "duration_minutes": duration,
        "earliest_date": earliest,
        "latest_date": latest,
        "part_of_day": part if part in PARTS_OF_DAY else "any",
        "preferred_time": time if isinstance(time, str) and _TIME_RE.match(time) else None,
        "other_timezone": _known_zone(preferences.get("other_timezone")),
    }


def _future_date(value: object, today: str) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        return None
    return value if parsed >= date.fromisoformat(today) else None


def _known_zone(value: object) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError, OSError):
        return None
    return value
