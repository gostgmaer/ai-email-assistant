from langchain_core.messages import AIMessage

from app.capabilities.reply.nodes import extract_response


def test_extract_response_sets_provider_model_and_usage():
    response = AIMessage(
        content="Hi there, thanks for reaching out.",
        usage_metadata={
            "input_tokens": 10,
            "output_tokens": 5,
            "total_tokens": 15,
        },
    )

    state = {"response": response}

    result = extract_response(state)

    assert result["draft"] == "Hi there, thanks for reaching out."
    assert result["usage"] == {
        "input_tokens": 10,
        "output_tokens": 5,
        "total_tokens": 15,
    }
    # Regression: extract_response previously omitted these, causing a
    # KeyError in email_ai_service.py when building ReplyResponse.
    assert "provider" in result
    assert "model" in result
