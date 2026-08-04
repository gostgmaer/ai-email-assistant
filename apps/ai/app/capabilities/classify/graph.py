from langgraph.graph import END
from langgraph.graph import START
from langgraph.graph import StateGraph

from .nodes import (
    build_messages,
    classify_email,
    extract_classification,
    load_prompt,
)
from .state import ClassifyState


def build_graph():
    builder = StateGraph(ClassifyState)

    builder.add_node("load_prompt", load_prompt)
    builder.add_node("build_messages", build_messages)
    builder.add_node("classify_email", classify_email)
    builder.add_node("extract_classification", extract_classification)

    builder.add_edge(START, "load_prompt")
    builder.add_edge("load_prompt", "build_messages")
    builder.add_edge("build_messages", "classify_email")
    builder.add_edge("classify_email", "extract_classification")
    builder.add_edge("extract_classification", END)

    return builder.compile()


classify_graph = build_graph()