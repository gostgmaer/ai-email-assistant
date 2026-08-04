from langgraph.graph import END
from langgraph.graph import START
from langgraph.graph import StateGraph

from .nodes import classify
from .nodes import extract
from .nodes import reply
from .nodes import summarize
from .state import ProcessState


def build_graph():
    graph = StateGraph(ProcessState)

    graph.add_node("classify", classify)
    graph.add_node("extract", extract)
    graph.add_node("summarize", summarize)
    graph.add_node("reply", reply)

    graph.add_edge(START, "classify")

    graph.add_edge("classify", "extract")

    graph.add_edge("extract", "summarize")

    graph.add_edge("summarize", "reply")

    graph.add_edge("reply", END)

    return graph.compile()


process_graph = build_graph()