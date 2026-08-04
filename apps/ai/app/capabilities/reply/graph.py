from langgraph.graph import END
from langgraph.graph import START
from langgraph.graph import StateGraph

from .nodes import generate_reply
from .nodes import prepare_prompt
from .state import ReplyState


def build_graph():

    graph = StateGraph(ReplyState)

    graph.add_node(
        "prepare_prompt",
        prepare_prompt,
    )

    graph.add_node(
        "generate_reply",
        generate_reply,
    )

    graph.add_edge(
        START,
        "prepare_prompt",
    )

    graph.add_edge(
        "prepare_prompt",
        "generate_reply",
    )

    graph.add_edge(
        "generate_reply",
        END,
    )

    return graph.compile()


reply_graph = build_graph()