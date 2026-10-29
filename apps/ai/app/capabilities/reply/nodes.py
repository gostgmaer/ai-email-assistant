from app.core.workflow.executor import llm_executor
from app.core.workflow.message_builder import MessageBuilder
from app.core.workflow.prompt_loader import prompt_loader
from app.core.workflow.response_parser import ResponseParser
from app.core.workflow.writing_style import writing_style_instruction

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


def _clean(value: str | None) -> str:
    return " ".join((value or "").split())


def sender_profile_instruction(profile: dict | None) -> str | None:
    """The sender identity part of the system message. The profile is the
    mailbox owner's own settings (trusted), unlike anything in the thread."""
    if not profile:
        return None

    name = _clean(profile.get("name"))
    job_title = _clean(profile.get("job_title"))
    company = _clean(profile.get("company"))

    lines: list[str] = []
    if name or job_title or company:
        who = name or "the mailbox owner"
        if job_title and company:
            who += f", {job_title} at {company}"
        elif job_title or company:
            who += f", {job_title or company}"
        lines.append(f"You are writing as {who}. Write in the first person as them.")

    if profile.get("has_signature"):
        lines.append(
            "A signature block is added automatically after your reply. Do not "
            "write one: no name, title, company or contact details at the end. "
            "A short closing such as \"Best,\" is fine."
        )
    elif name:
        first_name = name.split(" ")[0]
        lines.append(f"If the tone calls for a sign-off, sign as {first_name}.")

    return "\n".join(f"- {line}" for line in lines) if lines else None


def reply_instruction(state: ReplyState) -> str | None:
    """Sender identity, then the user's writing style — unless an agent
    persona is set: a persona fully defines how that account replies."""
    parts = [sender_profile_instruction(state.get("sender_profile"))]
    if not state.get("system_prompt_override"):
        parts.append(writing_style_instruction(state.get("writing_style")))
    joined = "\n\n".join(part for part in parts if part)
    return joined or None


def build_messages(state: ReplyState):
    state["messages"] = MessageBuilder.reply(
        system_prompt=state["system_prompt"],
        subject=state["subject"],
        thread=state["thread"],
        instruction=reply_instruction(state),
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