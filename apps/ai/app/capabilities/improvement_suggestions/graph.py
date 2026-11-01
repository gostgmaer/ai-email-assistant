from langgraph.graph import END
from langgraph.graph import START
from langgraph.graph import StateGraph

from .nodes import (
    build_messages,
    load_prompt,
    parse_suggestions,
    suggest_improvements,
)
from .state import ImprovementSuggestionsState


def build_graph():
    """Build the workflow that turns patterns in rejected AI drafts into
    proposed changes. apps/api stores them for a human to approve."""

    builder = StateGraph(ImprovementSuggestionsState)

    builder.add_node("load_prompt", load_prompt)
    builder.add_node("build_messages", build_messages)
    builder.add_node("suggest_improvements", suggest_improvements)
    builder.add_node("parse_suggestions", parse_suggestions)

    builder.add_edge(START, "load_prompt")
    builder.add_edge("load_prompt", "build_messages")
    builder.add_edge("build_messages", "suggest_improvements")
    builder.add_edge("suggest_improvements", "parse_suggestions")
    builder.add_edge("parse_suggestions", END)

    return builder.compile()


improvement_suggestions_graph = build_graph()
