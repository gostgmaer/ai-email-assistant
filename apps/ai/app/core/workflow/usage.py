from langchain_core.messages import AIMessage

from .response_parser import ResponseParser


def extract_usage(response: AIMessage) -> dict:
    return ResponseParser.usage(response)