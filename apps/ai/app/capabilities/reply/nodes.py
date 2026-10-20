from app.core.workflow.executor import llm_executor
from app.core.workflow.message_builder import MessageBuilder
from app.core.workflow.prompt_loader import prompt_loader
from app.core.workflow.response_parser import ResponseParser

from .state import ReplyState


def load_prompt(state: ReplyState):
    # An agent persona replaces reply.md's tone/style guidance, but never
    # its safety rules: reply_guardrails.md is appended to every persona, so
    # a persona saying "promise whatever it takes" can't switch off "don't
    # invent facts" or "no placeholders".
    override = state.get("system_prompt_override")
    if override:
        state["system_prompt"] = (
            override.rstrip() + "\n\n" + prompt_loader.load("reply_guardrails")
        )
    else:
        state["system_prompt"] = prompt_loader.load("reply")
    return state


def build_messages(state: ReplyState):
    state["messages"] = MessageBuilder.reply(
        system_prompt=state["system_prompt"],
        subject=state["subject"],
        thread=state["thread"],
        # The API's "instruction" field carries reference material
        # (documents, contact facts, calendar notes), partly derived from
        # third-party email — so it's passed as delimited, untrusted context,
        # never as instructions.
        context=state.get("instruction"),
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