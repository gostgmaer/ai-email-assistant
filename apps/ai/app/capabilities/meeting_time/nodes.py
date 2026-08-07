from app.core.workflow.executor import llm_executor
from app.core.workflow.message_builder import MessageBuilder
from app.core.workflow.prompt_loader import prompt_loader
from app.core.workflow.response_parser import ResponseParser

from .schemas import MeetingTimeSchema
from .state import SuggestMeetingTimeState


def load_prompt(state: SuggestMeetingTimeState) -> SuggestMeetingTimeState:
    """Load meeting-time prompt."""

    state["system_prompt"] = prompt_loader.load("meeting_time")

    return state


def build_messages(state: SuggestMeetingTimeState) -> SuggestMeetingTimeState:
    """Build LangChain messages."""

    state["messages"] = MessageBuilder.meeting_time(
        system_prompt=state["system_prompt"],
        description=state["description"],
        reference_date=state["reference_date"],
        busy=state["busy"],
    )

    return state


def suggest_meeting_time(state: SuggestMeetingTimeState) -> SuggestMeetingTimeState:
    """Run structured meeting-time suggestion."""

    response = llm_executor.invoke_structured(
        messages=state["messages"],
        schema=MeetingTimeSchema,
    )

    state["response"] = response

    return state


def extract_suggestion(state: SuggestMeetingTimeState) -> SuggestMeetingTimeState:
    """Extract structured response."""

    response = state["response"]

    state["suggestion"] = response.model_dump()

    state["provider"] = llm_executor.provider

    state["model"] = llm_executor.model

    state["usage"] = ResponseParser.usage(response)

    return state
