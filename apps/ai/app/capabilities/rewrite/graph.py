from langgraph.graph import END
from langgraph.graph import START
from langgraph.graph import StateGraph

from .nodes import (
    build_messages,
    extract_response,
    invoke_llm,
    load_prompt,
)
from .state import RewriteState


def build_graph():
    builder = StateGraph(
        RewriteState,
    )

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
        "extract_response",
        extract_response,
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
        "extract_response",
    )

    builder.add_edge(
        "extract_response",
        END,
    )

    return builder.compile()


rewrite_graph = build_graph()