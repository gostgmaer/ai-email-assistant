from langgraph.graph import END
from langgraph.graph import START
from langgraph.graph import StateGraph

from .nodes import (
    build_messages,
    extract_profile,
    load_prompt,
    parse_profile,
)
from .state import StyleProfileState


def build_graph():
    """Build the writing-style workflow: how the user writes, learned from
    their own sent mail."""

    builder = StateGraph(StyleProfileState)

    builder.add_node("load_prompt", load_prompt)
    builder.add_node("build_messages", build_messages)
    builder.add_node("extract_profile", extract_profile)
    builder.add_node("parse_profile", parse_profile)

    builder.add_edge(START, "load_prompt")
    builder.add_edge("load_prompt", "build_messages")
    builder.add_edge("build_messages", "extract_profile")
    builder.add_edge("extract_profile", "parse_profile")
    builder.add_edge("parse_profile", END)

    return builder.compile()


style_profile_graph = build_graph()
