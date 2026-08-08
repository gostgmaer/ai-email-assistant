from app.capabilities.validate_reply.nodes import build_messages, extract_validation


def test_build_messages_includes_the_draft_reply_to_evaluate():
    state = {
        "system_prompt": "You are reviewing a draft reply.",
        "subject": "Rescheduling Tuesday's sync",
        "thread": [
            {
                "name": "Alex",
                "email": "alex@example.com",
                "content": "Can we push our sync to Thursday instead?",
            }
        ],
        "draft_reply": "Thursday works for me — see you then!",
    }

    result = build_messages(state)

    # System + one thread message + the trailing instruction block.
    assert len(result["messages"]) == 3
    assert "Thursday works for me" in result["messages"][-1].content
    assert "Evaluate the following draft reply" in result["messages"][-1].content


def test_extract_validation_flags_a_draft_that_ignores_the_thread():
    class FakeResponse:
        def model_dump(self):
            return {
                "addresses_thread": False,
                "concerns": ["Ignores the reschedule request entirely"],
            }

    state = {"response": FakeResponse()}

    result = extract_validation(state)

    assert result["validation"]["addresses_thread"] is False
    assert result["validation"]["concerns"] == [
        "Ignores the reschedule request entirely"
    ]
    assert "provider" in result
    assert "model" in result
    assert "usage" in result
