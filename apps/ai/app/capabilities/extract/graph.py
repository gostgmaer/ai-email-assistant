from langgraph.graph import END
from langgraph.graph import START
from langgraph.graph import StateGraph

from .nodes import (
    build_messages,
    extract_entities,
    load_prompt,
    parse_entities,
)
from .state import ExtractState


def build_graph():
    builder = StateGraph(ExtractState)

    builder.add_node("load_prompt", load_prompt)
    builder.add_node("build_messages", build_messages)
    builder.add_node("extract_entities", extract_entities)
    builder.add_node("parse_entities", parse_entities)

    builder.add_edge(START, "load_prompt")
    builder.add_edge("load_prompt", "build_messages")
    builder.add_edge("build_messages", "extract_entities")
    builder.add_edge("extract_entities", "parse_entities")
    builder.add_edge("parse_entities", END)

    return builder.compile()


extract_graph = build_graph()