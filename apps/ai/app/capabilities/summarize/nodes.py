import json
import re

from langchain_core.messages import HumanMessage
from langchain_core.messages import SystemMessage

from app.core.llm import llm_manager
from app.core.prompts import prompt_manager

from .state import SummarizeState

_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


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
        raw = content

    elif isinstance(content, list):
        raw = "\n".join(
            part.get("text", "")
            for part in content
            if isinstance(part, dict)
        )

    else:
        raw = str(content)

    summary, key_points = _parse_summary(raw)

    state["summary"] = summary

    state["key_points"] = key_points

    state["provider"] = llm_manager.provider

    state["model"] = llm_manager.model

    usage = getattr(response, "usage_metadata", {}) or {}

    state["usage"] = {
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "total_tokens": usage.get("total_tokens", 0),
    }

    return state


def _parse_summary(raw: str) -> tuple[str, list[str]]:
    """Parse the model's JSON response into (summary, key_points).

    The prompt asks for raw JSON, but models often wrap it in a
    ```json fenced block; strip that before parsing. Falls back to
    treating the whole response as the summary if it isn't valid JSON.
    """

    text = _CODE_FENCE_RE.sub("", raw).strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return raw.strip(), []

    if not isinstance(data, dict):
        return raw.strip(), []

    summary = data.get("summary")
    key_points = data.get("key_points")

    return (
        summary if isinstance(summary, str) else raw.strip(),
        key_points if isinstance(key_points, list) else [],
    )