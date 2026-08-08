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

    parsed = _parse_summary(raw)

    state["summary"] = parsed["summary"]
    state["key_points"] = parsed["key_points"]
    state["action_items"] = parsed["action_items"]
    state["important_dates"] = parsed["important_dates"]
    state["participants"] = parsed["participants"]
    state["decisions_made"] = parsed["decisions_made"]

    state["provider"] = llm_manager.provider

    state["model"] = llm_manager.model

    usage = getattr(response, "usage_metadata", {}) or {}

    state["usage"] = {
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "total_tokens": usage.get("total_tokens", 0),
    }

    return state


def _parse_summary(raw: str) -> dict:
    """Parse the model's JSON response into a structured summary dict.

    The prompt asks for raw JSON, but models often wrap it in a
    ```json fenced block; strip that before parsing. Falls back to
    treating the whole response as the summary if it isn't valid JSON.
    """

    _empty: dict = {
        "summary": raw.strip(),
        "key_points": [],
        "action_items": [],
        "important_dates": [],
        "participants": [],
        "decisions_made": [],
    }

    text = _CODE_FENCE_RE.sub("", raw).strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return _empty

    if not isinstance(data, dict):
        return _empty

    def _str_list(key: str) -> list[str]:
        val = data.get(key)
        return val if isinstance(val, list) else []

    def _action_items(key: str) -> list[dict]:
        val = data.get(key)
        if not isinstance(val, list):
            return []
        result = []
        for item in val:
            if isinstance(item, dict) and "task" in item:
                result.append(
                    {
                        "task": str(item["task"]),
                        "owner": item.get("owner") or None,
                        "due_date": item.get("due_date") or None,
                    }
                )
        return result

    summary = data.get("summary")

    return {
        "summary": summary if isinstance(summary, str) else raw.strip(),
        "key_points": _str_list("key_points"),
        "action_items": _action_items("action_items"),
        "important_dates": _str_list("important_dates"),
        "participants": _str_list("participants"),
        "decisions_made": _str_list("decisions_made"),
    }