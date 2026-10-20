from app.core.workflow.executor import llm_executor
from app.core.workflow.message_builder import MessageBuilder
from app.core.workflow.prompt_loader import prompt_loader
from app.core.workflow.response_parser import ResponseParser

from .schemas import ReplyValidationSchema
from .state import ValidateReplyState


def load_prompt(state: ValidateReplyState) -> ValidateReplyState:
    """Load reply-validation prompt."""

    state["system_prompt"] = prompt_loader.load("validate_reply")

    return state


def build_messages(state: ValidateReplyState) -> ValidateReplyState:
    """Build LangChain messages — the thread, then the draft reply to
    evaluate as a delimited data block (the draft was written by a model
    that read the emails, so it's untrusted too)."""

    state["messages"] = MessageBuilder.email_thread(
        system_prompt=state["system_prompt"],
        subject=state["subject"],
        thread=state["thread"],
        instruction=(
            "Evaluate the draft reply inside the <draft_reply> tags. Does it "
            "actually address the email thread?"
        ),
        draft_reply=state["draft_reply"],
    )

    return state


def validate_reply(state: ValidateReplyState) -> ValidateReplyState:
    """Run structured validation."""

    response = llm_executor.invoke_structured(
        messages=state["messages"],
        schema=ReplyValidationSchema,
    )

    state["response"] = response

    return state


def extract_validation(state: ValidateReplyState) -> ValidateReplyState:
    """Extract structured response."""

    response = state["response"]

    state["validation"] = response.model_dump()

    state["provider"] = llm_executor.provider

    state["model"] = llm_executor.model

    state["usage"] = ResponseParser.usage(response)

    return state
