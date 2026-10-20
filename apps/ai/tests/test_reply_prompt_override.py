from unittest.mock import patch

from app.capabilities.reply.nodes import load_prompt


def test_load_prompt_uses_default_when_no_override():
    with patch(
        "app.capabilities.reply.nodes.prompt_loader.load",
        return_value="Default reply prompt.",
    ) as mock_load:
        state = {}

        result = load_prompt(state)

        assert result["system_prompt"] == "Default reply prompt."
        mock_load.assert_called_once_with("reply")


def test_load_prompt_uses_agent_override_but_keeps_the_guardrails():
    prompts = {
        "reply": "Default reply prompt.",
        "reply_guardrails": "Never invent facts.",
    }
    with patch(
        "app.capabilities.reply.nodes.prompt_loader.load",
        side_effect=lambda name: prompts[name],
    ) as mock_load:
        state = {"system_prompt_override": "You are a Customer Support Agent."}

        result = load_prompt(state)

        # The persona replaces reply.md's style guidance, but the
        # non-negotiable safety rules are always appended after it.
        assert result["system_prompt"] == (
            "You are a Customer Support Agent.\n\nNever invent facts."
        )
        mock_load.assert_called_once_with("reply_guardrails")


def test_reply_guardrails_prompt_exists_and_carries_the_safety_rules():
    from app.core.workflow.prompt_loader import prompt_loader

    guardrails = prompt_loader.load("reply_guardrails")

    assert "Do not invent facts" in guardrails
    assert "placeholder" in guardrails


def test_load_prompt_falls_back_to_default_for_an_empty_override():
    with patch(
        "app.capabilities.reply.nodes.prompt_loader.load",
        return_value="Default reply prompt.",
    ):
        # An empty string is falsy - treated the same as "no override" rather
        # than sent to the LLM as a blank system prompt.
        state = {"system_prompt_override": ""}

        result = load_prompt(state)

        assert result["system_prompt"] == "Default reply prompt."
