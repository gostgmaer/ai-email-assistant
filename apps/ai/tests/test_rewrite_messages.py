from app.capabilities.rewrite.nodes import build_messages
from app.capabilities.rewrite.schemas import RewriteRequest


def test_unset_tone_and_language_keep_the_originals():
    request = RewriteRequest(draft="नमस्ते, कल मिलते हैं।")

    state = build_messages({**request.model_dump(), "system_prompt": "Rewrite."})

    content = state["messages"][-1].content
    assert "Tone: Not specified — keep the original's tone" in content
    assert "Language: Not specified — keep the original's language" in content
    assert "नमस्ते, कल मिलते हैं।" in content


def test_a_requested_tone_and_instruction_are_passed_through():
    request = RewriteRequest(
        draft="hey, can u send the file",
        tone="friendly",
        instruction="Make it warmer.",
    )

    state = build_messages({**request.model_dump(), "system_prompt": "Rewrite."})

    content = state["messages"][-1].content
    assert "Tone: friendly" in content
    assert "Make it warmer." in content
