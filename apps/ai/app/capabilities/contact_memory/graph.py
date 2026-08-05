from langgraph.graph import END
from langgraph.graph import START
from langgraph.graph import StateGraph

from .nodes import (
    build_messages,
    embed_facts,
    extract_facts,
    load_prompt,
)
from .state import ContactMemoryState


def build_graph():
    builder = StateGraph(ContactMemoryState)

    builder.add_node("load_prompt", load_prompt)
    builder.add_node("build_messages", build_messages)
    builder.add_node("extract_facts", extract_facts)
    builder.add_node("embed_facts", embed_facts)

    builder.add_edge(START, "load_prompt")
    builder.add_edge("load_prompt", "build_messages")
    builder.add_edge("build_messages", "extract_facts")
    builder.add_edge("extract_facts", "embed_facts")
    builder.add_edge("embed_facts", END)

    return builder.compile()


contact_memory_graph = build_graph()
