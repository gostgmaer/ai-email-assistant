from app.core.workflow.executor import llm_executor
from app.core.workflow.message_builder import MessageBuilder
from app.core.workflow.prompt_loader import prompt_loader
from app.core.workflow.response_parser import ResponseParser

from .schemas import ClassificationSchema
from .state import ClassifyState


def load_prompt(state: ClassifyState) -> ClassifyState:
    """Load classification prompt."""

    state["system_prompt"] = prompt_loader.load("classify")

    return state


def build_messages(state: ClassifyState) -> ClassifyState:
    """Build LangChain messages."""

    state["messages"] = MessageBuilder.summarize(
        system_prompt=state["system_prompt"],
        subject=state["subject"],
        thread=state["thread"],
    )

    return state


def classify_email(state: ClassifyState) -> ClassifyState:
    """Run structured classification."""

    response = llm_executor.invoke_structured(
        messages=state["messages"],
        schema=ClassificationSchema,
    )

    state["response"] = response

    return state


def extract_classification(state: ClassifyState) -> ClassifyState:
    """Extract structured response."""

    response = state["response"]

    state["classification"] = response.model_dump()

    state["provider"] = llm_executor.provider

    state["model"] = llm_executor.model

    state["usage"] = ResponseParser.usage(response)

    return state