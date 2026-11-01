from langgraph.graph import END
from langgraph.graph import START
from langgraph.graph import StateGraph

from .nodes import (
    build_messages,
    extract_preferences,
    load_prompt,
    parse_preferences,
)
from .state import MeetingPreferencesState


def build_graph():
    """Build the workflow that reads what a meeting request asks for. The
    free slots themselves are picked by apps/api, from the real calendar."""

    builder = StateGraph(MeetingPreferencesState)

    builder.add_node("load_prompt", load_prompt)
    builder.add_node("build_messages", build_messages)
    builder.add_node("extract_preferences", extract_preferences)
    builder.add_node("parse_preferences", parse_preferences)

    builder.add_edge(START, "load_prompt")
    builder.add_edge("load_prompt", "build_messages")
    builder.add_edge("build_messages", "extract_preferences")
    builder.add_edge("extract_preferences", "parse_preferences")
    builder.add_edge("parse_preferences", END)

    return builder.compile()


meeting_preferences_graph = build_graph()
