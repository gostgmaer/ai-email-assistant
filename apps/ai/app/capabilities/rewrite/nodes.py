from app.core.llm import llm_manager
from app.core.workflow.executor import llm_executor
from app.core.workflow.message_builder import MessageBuilder
from app.core.workflow.prompt_loader import prompt_loader
from app.core.workflow.response_parser import ResponseParser

from .state import RewriteState


def load_prompt(state: RewriteState) -> RewriteState:
    """Load rewrite prompt."""

    state["system_prompt"] = prompt_loader.load("rewrite")

    return state


def build_messages(state: RewriteState) -> RewriteState:
    """Build rewrite messages."""

    state["messages"] = MessageBuilder.rewrite(
        system_prompt=state["system_prompt"],
        draft=state["draft"],
        tone=state["tone"],
        language=state["language"],
        instruction=state.get("instruction"),
    )

    return state


def invoke_llm(state: RewriteState) -> RewriteState:
    """Invoke LLM."""

    state["response"] = llm_executor.invoke(
        state["messages"],
    )

    return state


def extract_response(state: RewriteState) -> RewriteState:
    """Parse AI response."""

    response = state["response"]

    state["rewritten_draft"] = ResponseParser.text(
        response,
    )

    state["usage"] = ResponseParser.usage(
        response,
    )

    state["provider"] = llm_manager.provider
    state["model"] = llm_manager.model

    return state