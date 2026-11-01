from langchain_core.messages import HumanMessage, SystemMessage

from app.core.workflow.executor import llm_executor
from app.core.workflow.message_builder import UNTRUSTED_CONTENT_RULES, defuse
from app.core.workflow.prompt_loader import prompt_loader
from app.core.workflow.response_parser import ResponseParser

from .schemas import MeetingPickSchema
from .state import MeetingPickState


def load_prompt(state: MeetingPickState) -> MeetingPickState:
    """Load the meeting-pick prompt."""

    state["system_prompt"] = prompt_loader.load("meeting_pick")

    return state


def build_messages(state: MeetingPickState) -> MeetingPickState:
    """The offered times are ours, so they go in the system message; the
    reply is untrusted."""

    offered = "\n".join(
        f"{number}. {slot}" for number, slot in enumerate(state["slots"], start=1)
    )
    state["messages"] = [
        SystemMessage(content=(
            f"{state['system_prompt']}{UNTRUSTED_CONTENT_RULES}\n\n"
            f"The times offered were:\n{offered}"
        )),
        HumanMessage(content=(
            f"<email>\n{defuse(state['content'])}\n</email>"
        )),
    ]

    return state


def detect_pick(state: MeetingPickState) -> MeetingPickState:
    """Run structured detection of the accepted slot."""

    state["response"] = llm_executor.invoke_structured(
        messages=state["messages"],
        schema=MeetingPickSchema,
    )

    return state


def parse_pick(state: MeetingPickState) -> MeetingPickState:
    """A number that wasn't offered is no pick."""

    response = state["response"]

    state["pick"] = clean_pick(response.model_dump(), len(state["slots"]))
    state["provider"] = llm_executor.provider
    state["model"] = llm_executor.model
    state["usage"] = ResponseParser.usage(response)

    return state


def clean_pick(pick: dict, slot_count: int) -> dict:
    picked = pick.get("picked")
    if not isinstance(picked, int) or isinstance(picked, bool) or not 1 <= picked <= slot_count:
        return {"picked": None, "confidence": 0.0}

    confidence = pick.get("confidence")
    if not isinstance(confidence, (int, float)):
        confidence = 0.0

    return {"picked": picked, "confidence": min(max(float(confidence), 0.0), 1.0)}
