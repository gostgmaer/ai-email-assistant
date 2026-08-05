from app.core.llm import embedding_manager
from app.core.workflow.executor import llm_executor
from app.core.workflow.message_builder import MessageBuilder
from app.core.workflow.prompt_loader import prompt_loader
from app.core.workflow.response_parser import ResponseParser

from .schemas import ContactFactsSchema
from .state import ContactMemoryState


def load_prompt(state: ContactMemoryState) -> ContactMemoryState:
    """Load the contact-memory extraction prompt."""

    state["system_prompt"] = prompt_loader.load("contact_memory")

    return state


def build_messages(state: ContactMemoryState) -> ContactMemoryState:
    """Build LangChain messages."""

    state["messages"] = MessageBuilder.summarize(
        system_prompt=state["system_prompt"],
        subject=state["subject"],
        thread=state["thread"],
    )

    return state


def extract_facts(state: ContactMemoryState) -> ContactMemoryState:
    """Run structured extraction of sender facts."""

    response = llm_executor.invoke_structured(
        messages=state["messages"],
        schema=ContactFactsSchema,
    )

    state["response"] = response

    return state


def embed_facts(state: ContactMemoryState) -> ContactMemoryState:
    """Embed the extracted facts for later similarity search."""

    response = state["response"]

    facts = response.model_dump()

    state["facts"] = facts

    state["embedding"] = embedding_manager.embed(_facts_to_text(facts))

    state["provider"] = llm_executor.provider

    state["model"] = llm_executor.model

    state["usage"] = ResponseParser.usage(response)

    return state


def _facts_to_text(facts: dict) -> str:
    """Flatten extracted facts into a single string for embedding."""

    parts = [facts.get("summary") or ""]

    if facts.get("role"):
        parts.append(f"Role: {facts['role']}")

    if facts.get("company"):
        parts.append(f"Company: {facts['company']}")

    if facts.get("commitments"):
        parts.append("Commitments: " + "; ".join(facts["commitments"]))

    return "\n".join(part for part in parts if part)
