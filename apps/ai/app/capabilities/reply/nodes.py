from app.core.workflow.executor import llm_executor
from app.core.workflow.message_builder import MessageBuilder
from app.core.workflow.prompt_loader import prompt_loader
from app.core.workflow.response_parser import ResponseParser

from .state import ReplyState


def load_prompt(state: ReplyState):
    state["system_prompt"] = prompt_loader.load("reply")
    return state


def build_messages(state: ReplyState):
    state["messages"] = MessageBuilder.reply(
        system_prompt=state["system_prompt"],
        subject=state["subject"],
        thread=state["thread"],
        instruction=state.get("instruction"),
    )

    return state


def invoke_llm(state: ReplyState):
    state["response"] = llm_executor.invoke(state["messages"])
    return state


def extract_response(state: ReplyState):
    response = state["response"]

    state["draft"] = ResponseParser.text(response)
    state["usage"] = ResponseParser.usage(response)
    state["provider"] = llm_executor.provider
    state["model"] = llm_executor.model

    return state