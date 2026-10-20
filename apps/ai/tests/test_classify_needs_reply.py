from app.capabilities.classify.schemas import ClassificationSchema
from app.core.workflow.prompt_loader import prompt_loader

BASE = {
    "category": "General",
    "priority": "Low",
    "sentiment": "Positive",
    "spam": False,
    "language": "en",
    "contains_pii": False,
    "pii_types": [],
}


def test_needs_reply_defaults_to_true_when_the_model_omits_it():
    # A model (or an older prompt) that leaves the field out must never
    # silently suppress replies.
    result = ClassificationSchema(**BASE)

    assert result.needs_reply is True
    assert result.reply_reason == ""


def test_needs_reply_false_is_carried_through():
    result = ClassificationSchema(
        **BASE, needs_reply=False, reply_reason="thank-you only"
    )

    assert result.model_dump()["needs_reply"] is False
    assert result.model_dump()["reply_reason"] == "thank-you only"


def test_classify_prompt_asks_for_the_needs_reply_decision():
    prompt = prompt_loader.load("classify")

    assert "needs_reply" in prompt
    assert "reply_reason" in prompt
