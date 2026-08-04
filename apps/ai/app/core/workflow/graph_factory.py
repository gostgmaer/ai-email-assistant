from collections.abc import Callable

from langgraph.graph import END
from langgraph.graph import START
from langgraph.graph import StateGraph


def create_graph(
    *,
    state_schema,
    nodes: dict[str, Callable],
):
    """
    Generic workflow graph builder.
    """

    builder = StateGraph(state_schema)

    previous = START

    for name, node in nodes.items():
        builder.add_node(
            name,
            node,
        )

        builder.add_edge(
            previous,
            name,
        )

        previous = name

    builder.add_edge(
        previous,
        END,
    )

    return builder.compile()