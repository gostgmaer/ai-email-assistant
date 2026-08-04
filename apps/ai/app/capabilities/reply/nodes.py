from langchain_core.messages import AIMessage
from langchain_core.messages import HumanMessage
from langchain_core.messages import SystemMessage

from app.core.llm import extract_text, llm_manager
from app.core.prompts import prompt_manager

from .state import ReplyState


def load_prompt(state: ReplyState) -> ReplyState:
    """Load the system prompt."""

    state["system_prompt"] = prompt_manager.get("reply")
    return state


def build_messages(state: ReplyState) -> ReplyState:
    """Convert email thread into LangChain messages."""

    messages = [
        SystemMessage(content=state["system_prompt"]),
    ]

    for email in state["thread"]:
        messages.append(
            HumanMessage(
                content=f"""
From: {email['name']} <{email['email']}>

Subject: {state['subject']}

{email['content']}
"""
            )
        )

    if state.get("instruction"):
        messages.append(
            HumanMessage(
                content=f"Instruction: {state['instruction']}"
            )
        )

    state["messages"] = messages

    return state


def invoke_llm(state: ReplyState) -> ReplyState:
    """Call the configured LLM."""

    llm = llm_manager.get_model()

    response = llm.invoke(state["messages"])

    state["response"] = response

    return state


def extract_response(state: ReplyState) -> ReplyState:
    """Extract the useful information from the AI response."""

    response: AIMessage = state["response"]

    state["draft"] = extract_text(response.content)

    state["provider"] = llm_manager.provider

    state["model"] = llm_manager.model

    usage = getattr(response, "usage_metadata", {}) or {}

    state["usage"] = {
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "total_tokens": usage.get("total_tokens", 0),
    }

    return state