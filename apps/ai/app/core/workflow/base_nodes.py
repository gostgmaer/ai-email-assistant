from langchain_core.messages import AIMessage

from app.core.llm import llm_manager

from .executor import llm_executor
from .prompt_loader import prompt_loader
from .response_parser import ResponseParser


class BaseWorkflowNodes:
    """Reusable workflow helpers."""

    @staticmethod
    def load_prompt(state: dict, prompt_name: str):
        state["system_prompt"] = prompt_loader.load(prompt_name)
        return state

    @staticmethod
    def invoke_llm(state: dict):
        response = llm_executor.invoke(state["messages"])
        state["response"] = response
        return state

    @staticmethod
    def parse_text(state: dict, output_key: str):
        response: AIMessage = state["response"]

        state[output_key] = ResponseParser.text(response)
        state["usage"] = ResponseParser.usage(response)
        state["provider"] = llm_manager.provider
        state["model"] = llm_manager.model

        return state