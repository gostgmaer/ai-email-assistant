from app.core.workflow.executor import llm_executor
from app.core.workflow.message_builder import MessageBuilder
from app.core.workflow.prompt_loader import prompt_loader
from app.core.workflow.response_parser import ResponseParser

from .schemas import ExtractionSchema
from .state import ExtractState


def load_prompt(state: ExtractState):
    state["system_prompt"] = prompt_loader.load("extract")
    return state


def build_messages(state: ExtractState):
    state["messages"] = MessageBuilder.summarize(
        system_prompt=state["system_prompt"],
        subject=state["subject"],
        thread=state["thread"],
    )
    return state


def extract_entities(state: ExtractState):
    response = llm_executor.invoke_structured(
        messages=state["messages"],
        schema=ExtractionSchema,
    )

    state["response"] = response

    return state


def parse_entities(state: ExtractState):
    response = state["response"]

    state["extraction"] = response.model_dump()

    state["provider"] = llm_executor.provider
    state["model"] = llm_executor.model
    state["usage"] = ResponseParser.usage(response)

    return state