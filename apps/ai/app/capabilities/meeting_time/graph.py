from langgraph.graph import END, START, StateGraph

from .nodes import (
    build_messages,
    extract_suggestion,
    load_prompt,
    suggest_meeting_time,
)
from .state import SuggestMeetingTimeState


def build_graph():
    builder = StateGraph(SuggestMeetingTimeState)

    builder.add_node("load_prompt", load_prompt)
    builder.add_node("build_messages", build_messages)
    builder.add_node("suggest_meeting_time", suggest_meeting_time)
    builder.add_node("extract_suggestion", extract_suggestion)

    builder.add_edge(START, "load_prompt")
    builder.add_edge("load_prompt", "build_messages")
    builder.add_edge("build_messages", "suggest_meeting_time")
    builder.add_edge("suggest_meeting_time", "extract_suggestion")
    builder.add_edge("extract_suggestion", END)

    return builder.compile()


meeting_time_graph = build_graph()
