from langgraph.graph import END
from langgraph.graph import START
from langgraph.graph import StateGraph

from .nodes import (
    build_messages,
    extract_commitments,
    load_prompt,
    parse_commitments,
)
from .state import CommitmentsState


def build_graph():
    """Build the commitments workflow: promises the sender makes in one
    outgoing message."""

    builder = StateGraph(CommitmentsState)

    builder.add_node("load_prompt", load_prompt)
    builder.add_node("build_messages", build_messages)
    builder.add_node("extract_commitments", extract_commitments)
    builder.add_node("parse_commitments", parse_commitments)

    builder.add_edge(START, "load_prompt")
    builder.add_edge("load_prompt", "build_messages")
    builder.add_edge("build_messages", "extract_commitments")
    builder.add_edge("extract_commitments", "parse_commitments")
    builder.add_edge("parse_commitments", END)

    return builder.compile()


commitments_graph = build_graph()
