import re
from datetime import date

from app.core.workflow.executor import llm_executor
from app.core.workflow.message_builder import MessageBuilder
from app.core.workflow.prompt_loader import prompt_loader
from app.core.workflow.response_parser import ResponseParser

from .schemas import CommitmentListSchema
from .state import CommitmentsState

# One sent message rarely holds more real promises than this; anything past
# it is more likely the model listing every sentence.
MAX_COMMITMENTS = 5
MAX_TEXT_LENGTH = 300

_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def load_prompt(state: CommitmentsState) -> CommitmentsState:
    """Load the commitments prompt."""

    state["system_prompt"] = prompt_loader.load("commitments")

    return state


def build_messages(state: CommitmentsState) -> CommitmentsState:
    """The sent message as the one (untrusted) email; the dates it's read
    against are ours, so they go in the system message."""

    state["messages"] = MessageBuilder.email_thread(
        system_prompt=state["system_prompt"],
        subject=state["subject"],
        thread=[
            {
                "name": state["sender_name"],
                "email": "sender",
                "content": state["content"],
            }
        ],
        instruction=(
            f"The message was sent on {state['sent_at']} "
            f"({state['timezone']}). Resolve relative dates against that."
        ),
    )

    return state


def extract_commitments(state: CommitmentsState) -> CommitmentsState:
    """Run structured extraction of the sender's commitments."""

    state["response"] = llm_executor.invoke_structured(
        messages=state["messages"],
        schema=CommitmentListSchema,
    )

    return state


def parse_commitments(state: CommitmentsState) -> CommitmentsState:
    """Keep only well-formed commitments and dates the API can trust."""

    response = state["response"]

    state["commitments"] = clean_commitments(
        response.model_dump().get("commitments") or [],
        state["sent_date"],
    )
    state["provider"] = llm_executor.provider
    state["model"] = llm_executor.model
    state["usage"] = ResponseParser.usage(response)

    return state


def clean_commitments(raw: list[dict], sent_date: str) -> list[dict]:
    """Drops empty or duplicate texts, clamps confidence to 0..1, and clears
    any due date that isn't a real date on or after the day the message was
    sent (a due time without a date is meaningless, so it goes too)."""

    try:
        earliest = date.fromisoformat(sent_date)
    except ValueError:
        earliest = None

    cleaned: list[dict] = []
    seen: set[str] = set()

    for item in raw:
        text = " ".join(str(item.get("text") or "").split())[:MAX_TEXT_LENGTH]
        key = text.lower()
        if not text or key in seen:
            continue
        seen.add(key)

        due_date = _valid_date(item.get("due_date"), earliest)
        due_time = item.get("due_time")
        if not due_date or not isinstance(due_time, str) or not _TIME_RE.match(due_time):
            due_time = None

        try:
            confidence = float(item.get("confidence") or 0)
        except (TypeError, ValueError):
            confidence = 0.0

        cleaned.append({
            "text": text,
            "due_date": due_date,
            "due_time": due_time,
            "confidence": min(max(confidence, 0.0), 1.0),
        })

        if len(cleaned) == MAX_COMMITMENTS:
            break

    return cleaned


def _valid_date(value: object, earliest: date | None) -> str | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = date.fromisoformat(value.strip())
    except ValueError:
        return None
    if earliest and parsed < earliest:
        return None
    return parsed.isoformat()
