from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage


class MessageBuilder:
    """Reusable LangChain message builders."""

    @staticmethod
    def email_thread(
        *,
        system_prompt: str,
        subject: str,
        thread: list[dict],
        instruction: str | None = None,
    ) -> list[BaseMessage]:
        messages: list[BaseMessage] = [
            SystemMessage(content=system_prompt),
        ]

        for email in thread:
            messages.append(HumanMessage(content=f"""
From: {email["name"]} <{email["email"]}>

Subject: {subject}

{email["content"]}
""".strip()))

        if instruction:
            messages.append(HumanMessage(content=f"""
Instruction:

{instruction}
""".strip()))

        return messages

    # Aliases used by per-capability nodes.py files.
    reply = email_thread
    summarize = email_thread

    @staticmethod
    def meeting_time(
        *,
        system_prompt: str,
        description: str,
        reference_date: str,
        busy: list[dict],
    ) -> list[BaseMessage]:
        busy_lines = (
            "\n".join(f"- {b['start']} to {b['end']}" for b in busy)
            if busy
            else "(none — the calendar is free for the lookup window)"
        )
        return [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"""
Reference date/time: {reference_date}

Meeting request: {description}

Busy intervals:
{busy_lines}
""".strip()),
        ]

    @staticmethod
    def email_draft(
        *,
        system_prompt: str,
        draft: str,
        tone: str,
        language: str,
        instruction: str | None = None,
    ) -> list[BaseMessage]:
        return [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"""
Tone: {tone}

Language: {language}

Instruction:
{instruction or "None"}

Email:

{draft}
""".strip()),
        ]

    rewrite = email_draft
