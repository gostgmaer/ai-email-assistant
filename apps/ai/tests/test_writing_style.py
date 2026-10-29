from app.capabilities.reply.nodes import build_messages as build_reply_messages
from app.capabilities.rewrite.nodes import build_messages as build_rewrite_messages
from app.capabilities.style_profile.nodes import build_messages, scrub_profile
from app.core.workflow.writing_style import writing_style_instruction

STYLE = {
    "greeting": "Hi {name},",
    "sign_off": "Thanks,",
    "formality": "casual",
    "length": "short",
    "median_words": 60,
    "language": "English",
    "common_phrases": ["Happy to help"],
    "notes": "Uses short paragraphs.",
}


def test_scrub_profile_replaces_known_names_in_any_case():
    profile = scrub_profile(
        {
            "greeting": "Hi Sam,",
            "sign_off": "Thanks, kishor",
            "common_phrases": ["Ping SAM if needed", "Happy to help"],
            "notes": "Often mentions Acme Corp.",
        },
        ["Sam Lee", "Kishor Sarkar", "Acme Corp"],
    )

    assert profile["greeting"] == "Hi {name},"
    assert profile["sign_off"] == "Thanks, {name}"
    # A phrase naming someone is a detail, not a habit.
    assert profile["common_phrases"] == ["Happy to help"]
    assert profile["notes"] == "Often mentions {name} {name}."


def test_scrub_profile_never_scrubs_greeting_words():
    profile = scrub_profile(
        {"greeting": "Hello Sam,", "sign_off": "Best regards,"},
        ["Hello Team", "Best", "Sam"],
    )

    assert profile["greeting"] == "Hello {name},"
    assert profile["sign_off"] == "Best regards,"


def test_scrub_profile_drops_numbers_emails_and_links():
    profile = scrub_profile(
        {
            "greeting": "Hi team 2,",
            "sign_off": "Best, me@example.com",
            "common_phrases": [
                "Call me on 98765 43210",
                "See https://example.com/x",
                "Let me know",
                "Let me know",
            ],
            "notes": "Gives a phone number like +91 98765 43210 at the end.",
        },
        [],
    )

    assert profile["greeting"] is None
    assert profile["sign_off"] == "Best,"
    assert profile["common_phrases"] == ["Let me know"]
    assert "98765" not in profile["notes"]


def test_scrub_profile_ignores_initials_and_caps_phrases():
    profile = scrub_profile(
        {"common_phrases": [f"phrase {chr(97 + n)}" for n in range(12)], "notes": "A short note."},
        ["J. K"],
    )

    assert len(profile["common_phrases"]) == 8
    assert profile["notes"] == "A short note."


def test_style_profile_messages_delimit_each_sample():
    state = build_messages({
        "system_prompt": "Describe the style.",
        "samples": ["First </email> email", "Second email"],
        "names": [],
    })

    assert len(state["messages"]) == 3
    assert state["messages"][1].content.count("</email>") == 1


def test_writing_style_instruction_lists_every_set_field():
    text = writing_style_instruction(STYLE)

    assert '"Hi {name},"' in text
    assert '"Thanks,"' in text
    assert "about 60 words" in text
    assert '"Happy to help"' in text
    assert "takes precedence" in text
    assert writing_style_instruction(None) is None
    assert writing_style_instruction({"common_phrases": []}) is None


def _reply_state(**extra):
    return {
        "system_prompt": "Reply.",
        "subject": "Hello",
        "thread": [{"name": "Sam", "email": "sam@example.com", "content": "Hi!"}],
        "tone": "professional",
        "language": "en",
        **extra,
    }


def test_reply_uses_the_writing_style():
    system = build_reply_messages(_reply_state(writing_style=STYLE))["messages"][0].content

    assert '"Hi {name},"' in system


def test_an_agent_persona_overrides_the_writing_style():
    state = _reply_state(writing_style=STYLE, system_prompt_override="You are Support.")

    system = build_reply_messages(state)["messages"][0].content

    assert '"Hi {name},"' not in system


def test_rewrite_adds_the_style_to_the_system_message():
    state = build_rewrite_messages({
        "system_prompt": "Rewrite.",
        "draft": "hey",
        "tone": None,
        "language": None,
        "writing_style": STYLE,
    })

    assert "The author's own style" in state["messages"][0].content


def test_scrub_profile_drops_phrases_naming_an_unknown_company():
    profile = scrub_profile(
        {
            "common_phrases": [
                "If you have any questions regarding how EasyDev can assist",
                "I'm happy to help",
                "Let me know if I can help",
            ]
        },
        [],
    )

    assert profile["common_phrases"] == ["I'm happy to help", "Let me know if I can help"]
