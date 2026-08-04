from langchain_core.messages import HumanMessage
from langchain_core.messages import SystemMessage

from app.core.llm import llm_manager
from app.core.prompts import prompt_manager

from .state import SummarizeState


def load_prompt(state: SummarizeState) -> SummarizeState:
    """Load summarize system prompt."""

    state["system_prompt"] = prompt_manager.get("summarize")

    return state


def build_messages(state: SummarizeState) -> SummarizeState:
    """Build LangChain messages."""

    messages = [
        SystemMessage(content=state["system_prompt"]),
    ]

    for email in state["thread"]:
        messages.append(
            HumanMessage(
                content=f"""
From: {email["name"]} <{email["email"]}>

Subject: {state["subject"]}

{email["content"]}
"""
            )
        )

    state["messages"] = messages

    return state


def invoke_llm(state: SummarizeState) -> SummarizeState:
    """Invoke configured LLM."""

    llm = llm_manager.get_model()

    response = llm.invoke(state["messages"])

    state["response"] = response

    return state


def extract_summary(state: SummarizeState) -> SummarizeState:
    """Extract summary response."""

    response = state["response"]

    content = response.content

    if isinstance(content, str):
        summary = content

    elif isinstance(content, list):
        summary = "\n".join(
            part.get("text", "")
            for part in content
            if isinstance(part, dict)
        )

    else:
        summary = str(content)

    state["summary"] = summary

    state["key_points"] = []

    state["provider"] = llm_manager.provider

    state["model"] = llm_manager.model

    usage = getattr(response, "usage_metadata", {}) or {}

    state["usage"] = {
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "total_tokens": usage.get("total_tokens", 0),
    }

    return state