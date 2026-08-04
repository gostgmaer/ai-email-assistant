from langgraph.graph import END
from langgraph.graph import START
from langgraph.graph import StateGraph

from .nodes import generate_reply
from .nodes import prepare_prompt
from .state import ReplyState


def build_reply_graph():

    builder = StateGraph(ReplyState)

    builder.add_node(
        "prepare_prompt",
        prepare_prompt,
    )

    builder.add_node(
        "generate_reply",
        generate_reply,
    )

    builder.add_edge(
        START,
        "prepare_prompt",
    )

    builder.add_edge(
        "prepare_prompt",
        "generate_reply",
    )

    builder.add_edge(
        "generate_reply",
        END,
    )

    return builder.compile()


reply_graph = build_reply_graph()
