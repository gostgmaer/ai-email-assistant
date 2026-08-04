from langchain_core.messages import HumanMessage
from langchain_core.messages import SystemMessage
from langchain_core.messages import BaseMessage


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
