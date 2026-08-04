from langchain_core.messages import HumanMessage
from langchain_core.messages import SystemMessage

from app.core.llm import llm_manager
from app.core.prompts import prompt_manager

from .state import ReplyState


def prepare_prompt(state: ReplyState) -> ReplyState:
    """Prepare chat messages."""

    system_prompt = prompt_manager.get("reply")

    messages = [
        SystemMessage(content=system_prompt),
    ]

    for email in state["thread"]:
        messages.append(
            HumanMessage(
                content=f"""
From: {email['name']} <{email['email']}>

Subject: {state['subject']}

{email['content']}
"""
            )
        )

    if state.get("instruction"):
        messages.append(
            HumanMessage(
                content=f"Instruction: {state['instruction']}"
            )
        )

    state["messages"] = messages

    return state


def generate_reply(state: ReplyState) -> ReplyState:
    """Generate AI reply."""

    llm = llm_manager.get_model()

    response = llm.invoke(state["messages"])

    state["draft"] = response.content

    state["provider"] = llm_manager.provider

    state["model"] = llm_manager.model

    if hasattr(response, "usage_metadata"):
        state["usage"] = {
            "input_tokens": response.usage_metadata.get(
                "input_tokens", 0
            ),
            "output_tokens": response.usage_metadata.get(
                "output_tokens", 0
            ),
            "total_tokens": response.usage_metadata.get(
                "total_tokens", 0
            ),
        }

    return state