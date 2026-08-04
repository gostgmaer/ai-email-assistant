from langgraph.graph import END
from langgraph.graph import START
from langgraph.graph import StateGraph

from .nodes import (
    build_messages,
    extract_summary,
    invoke_llm,
    load_prompt,
)
from .state import SummarizeState


def build_graph():
    """Build summarize workflow."""

    builder = StateGraph(SummarizeState)

    builder.add_node(
        "load_prompt",
        load_prompt,
    )

    builder.add_node(
        "build_messages",
        build_messages,
    )

    builder.add_node(
        "invoke_llm",
        invoke_llm,
    )

    builder.add_node(
        "extract_summary",
        extract_summary,
    )

    builder.add_edge(
        START,
        "load_prompt",
    )

    builder.add_edge(
        "load_prompt",
        "build_messages",
    )

    builder.add_edge(
        "build_messages",
        "invoke_llm",
    )

    builder.add_edge(
        "invoke_llm",
        "extract_summary",
    )

    builder.add_edge(
        "extract_summary",
        END,
    )

    return builder.compile()


summarize_graph = build_graph()
