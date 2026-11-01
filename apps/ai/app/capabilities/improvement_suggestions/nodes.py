from langchain_core.messages import HumanMessage, SystemMessage

from app.core.workflow.executor import llm_executor
from app.core.workflow.message_builder import UNTRUSTED_CONTENT_RULES, defuse
from app.core.workflow.prompt_loader import prompt_loader
from app.core.workflow.response_parser import ResponseParser

from .schemas import SuggestionListSchema
from .state import ImprovementSuggestionsState

MAX_INSTRUCTION_LENGTH = 300
MAX_RATIONALE_LENGTH = 300


def load_prompt(state: ImprovementSuggestionsState) -> ImprovementSuggestionsState:
    """Load the improvement-suggestions prompt."""

    state["system_prompt"] = prompt_loader.load("improvement_suggestions")

    return state


def build_messages(state: ImprovementSuggestionsState) -> ImprovementSuggestionsState:
    """The counts are ours; the drafts quote other people's email, so each
    example goes inside its own delimited block."""

    sections = []
    for number, group in enumerate(state["groups"], start=1):
        reasons = ", ".join(
            f"{reason}: {count}" for reason, count in group["reasons"].items()
        )
        lines = [
            f"Group {number} ({group['type']}): {defuse(group['label'])}",
            f"Reviewed {group['reviewed']}, discarded {group['discarded']}, "
            f"heavily edited {group['heavily_edited']}.",
            f"Discard reasons: {reasons or 'none given'}.",
        ]
        for example in group["examples"]:
            sent = example.get("sent")
            lines.append(
                "<email>\n"
                f"AI draft: {defuse(example['draft'])}\n"
                + (f"Sent instead: {defuse(sent)}\n" if sent else "Discarded.\n")
                + "</email>"
            )
        sections.append("\n".join(lines))

    state["messages"] = [
        SystemMessage(content=state["system_prompt"] + UNTRUSTED_CONTENT_RULES),
        HumanMessage(content="\n\n".join(sections)),
    ]

    return state


def suggest_improvements(state: ImprovementSuggestionsState) -> ImprovementSuggestionsState:
    """Run structured generation of the suggestions."""

    state["response"] = llm_executor.invoke_structured(
        messages=state["messages"],
        schema=SuggestionListSchema,
    )

    return state


def parse_suggestions(state: ImprovementSuggestionsState) -> ImprovementSuggestionsState:
    """Drop anything that doesn't fit a group that was actually sent."""

    response = state["response"]

    state["suggestions"] = clean_suggestions(
        response.model_dump().get("suggestions") or [],
        state["groups"],
    )
    state["provider"] = llm_executor.provider
    state["model"] = llm_executor.model
    state["usage"] = ResponseParser.usage(response)

    return state


def clean_suggestions(suggestions: list[dict], groups: list[dict]) -> list[dict]:
    """One per group, for a group that exists. An agent suggestion is its
    instruction, so one without any is dropped; a domain or category
    suggestion never carries one, since apps/api builds that change itself."""

    cleaned: list[dict] = []
    seen: set[int] = set()
    for suggestion in suggestions:
        number = suggestion.get("group")
        if not isinstance(number, int) or not 1 <= number <= len(groups) or number in seen:
            continue

        is_agent = groups[number - 1]["type"] == "agent"
        instruction = _one_line(suggestion.get("instruction"))[:MAX_INSTRUCTION_LENGTH]
        if is_agent and not instruction:
            continue

        seen.add(number)
        cleaned.append({
            "group": number,
            "instruction": instruction if is_agent else "",
            "rationale": _one_line(suggestion.get("rationale"))[:MAX_RATIONALE_LENGTH],
        })

    return cleaned


def _one_line(value: object) -> str:
    return " ".join(value.split()) if isinstance(value, str) else ""
