from langgraph.graph import END
from langgraph.graph import START
from langgraph.graph import StateGraph

from .nodes import build_messages, detect_pick, load_prompt, parse_pick
from .state import MeetingPickState


def build_graph():
    """Build the workflow that reads whether a reply accepts one of the
    meeting times offered to its sender."""

    builder = StateGraph(MeetingPickState)

    builder.add_node("load_prompt", load_prompt)
    builder.add_node("build_messages", build_messages)
    builder.add_node("detect_pick", detect_pick)
    builder.add_node("parse_pick", parse_pick)

    builder.add_edge(START, "load_prompt")
    builder.add_edge("load_prompt", "build_messages")
    builder.add_edge("build_messages", "detect_pick")
    builder.add_edge("detect_pick", "parse_pick")
    builder.add_edge("parse_pick", END)

    return builder.compile()


meeting_pick_graph = build_graph()
