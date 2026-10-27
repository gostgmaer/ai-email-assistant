import json
import re

from app.core.llm import llm_manager
from app.core.prompts import prompt_manager
from app.core.workflow.executor import llm_executor
from app.core.workflow.message_builder import MessageBuilder

from .state import AnswerState

_CODE_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)
_CITATION_RE = re.compile(r"\[(\d+)\]")

NOT_FOUND_ANSWER = "I couldn't find that in your email."


def load_prompt(state: AnswerState) -> AnswerState:
    """Load answer system prompt."""

    state["system_prompt"] = prompt_manager.get("answer")

    return state


def build_messages(state: AnswerState) -> AnswerState:
    """Build LangChain messages."""

    state["messages"] = MessageBuilder.ask_sources(
        system_prompt=state["system_prompt"],
        question=state["question"],
        today=state["today"],
        sources=state["sources"],
    )

    return state


def invoke_llm(state: AnswerState) -> AnswerState:
    """Invoke configured LLM through llm_executor (retry/backoff + provider
    fallback, like every other capability)."""

    state["response"] = llm_executor.invoke(state["messages"])

    return state


def extract_answer(state: AnswerState) -> AnswerState:
    """Parse the model's JSON and keep only citations of real sources."""

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

    valid = {source["n"] for source in state["sources"]}
    answer, citations, found = parse_answer(raw, valid)

    state["answer"] = answer
    state["citations"] = citations
    state["found"] = found
    state["provider"] = llm_manager.provider
    state["model"] = llm_manager.model

    usage = getattr(response, "usage_metadata", {}) or {}
    state["usage"] = {
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "total_tokens": usage.get("total_tokens", 0),
    }

    return state


def parse_answer(raw: str, valid: set[int]) -> tuple[str, list[int], bool]:
    """(answer, citations, found) from the model's output.

    Citations come from the [n] markers in the answer text itself — what the
    reader sees — not only from the model's own "citations" list, and any
    number that wasn't a provided source is dropped from both. Falls back to
    the raw text when the output isn't the requested JSON.
    """

    text = _CODE_FENCE_RE.sub("", raw).strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        data = None

    if isinstance(data, dict) and isinstance(data.get("answer"), str):
        answer = data["answer"].strip()
        found = data.get("found") is not False
    else:
        answer = raw.strip()
        found = True

    # Remove markers pointing at sources that don't exist, so the reader
    # never sees a citation with nothing behind it.
    answer = _CITATION_RE.sub(
        lambda m: m.group(0) if int(m.group(1)) in valid else "",
        answer,
    ).strip()

    citations: list[int] = []
    for match in _CITATION_RE.finditer(answer):
        n = int(match.group(1))
        if n not in citations:
            citations.append(n)

    if not answer:
        return NOT_FOUND_ANSWER, [], False

    # An answer that cites nothing isn't backed by any email.
    return answer, citations, found and bool(citations)
