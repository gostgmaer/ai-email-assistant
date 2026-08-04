from app.capabilities.classify.graph import classify_graph
from app.capabilities.extract.graph import extract_graph
from app.capabilities.reply.graph import reply_graph
from app.capabilities.summarize.graph import summarize_graph

from .state import ProcessState


async def classify(state: ProcessState):
    result = await classify_graph.ainvoke(
        {
            "subject": state["subject"],
            "thread": state["thread"],
        }
    )

    state["classification"] = result["classification"]

    return state


async def extract(state: ProcessState):
    result = await extract_graph.ainvoke(
        {
            "subject": state["subject"],
            "thread": state["thread"],
        }
    )

    state["extraction"] = result["extraction"]

    return state


async def summarize(state: ProcessState):
    result = await summarize_graph.ainvoke(
        {
            "subject": state["subject"],
            "thread": state["thread"],
        }
    )

    state["summary"] = result["summary"]

    return state


async def reply(state: ProcessState):
    result = await reply_graph.ainvoke(
        {
            "subject": state["subject"],
            "thread": state["thread"],
            "instruction": state.get("instruction"),
        }
    )

    state["draft"] = result["draft"]

    state["provider"] = result["provider"]
    state["model"] = result["model"]
    state["usage"] = result["usage"]

    return state