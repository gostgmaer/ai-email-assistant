from langchain_core.messages import HumanMessage, SystemMessage

from .state import ReplyState


def prepare_prompt(state: ReplyState) -> ReplyState:
    """
    Build chat messages for the LLM.
    """

    messages = [
        SystemMessage(content=state["system_prompt"]),
    ]

    for email in state["thread"]:
        messages.append(
            HumanMessage(
                content=f"""
From: {email['name']} <{email['email']}>

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
    """
    Placeholder until LLMManager is ready.
    """

    raise NotImplementedError(
        "Connect LLMManager in the next step."
    )