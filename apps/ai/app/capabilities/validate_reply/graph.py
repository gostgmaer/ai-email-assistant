from langgraph.graph import END
from langgraph.graph import START
from langgraph.graph import StateGraph

from .nodes import (
    build_messages,
    extract_validation,
    load_prompt,
    validate_reply,
)
from .state import ValidateReplyState


def build_graph():
    builder = StateGraph(ValidateReplyState)

    builder.add_node("load_prompt", load_prompt)
    builder.add_node("build_messages", build_messages)
    builder.add_node("validate_reply", validate_reply)
    builder.add_node("extract_validation", extract_validation)

    builder.add_edge(START, "load_prompt")
    builder.add_edge("load_prompt", "build_messages")
    builder.add_edge("build_messages", "validate_reply")
    builder.add_edge("validate_reply", "extract_validation")
    builder.add_edge("extract_validation", END)

    return builder.compile()


validate_reply_graph = build_graph()
