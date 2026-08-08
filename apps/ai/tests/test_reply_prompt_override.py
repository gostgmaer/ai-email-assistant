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


def test_load_prompt_uses_agent_override_and_skips_the_default_file():
    with patch(
        "app.capabilities.reply.nodes.prompt_loader.load",
        return_value="Default reply prompt.",
    ) as mock_load:
        state = {"system_prompt_override": "You are a Customer Support Agent."}

        result = load_prompt(state)

        assert result["system_prompt"] == "You are a Customer Support Agent."
        mock_load.assert_not_called()


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
