from unittest.mock import MagicMock, patch

from langchain_core.messages import AIMessage
from pydantic import BaseModel

from app.core.workflow import executor
from app.core.workflow.response_parser import ResponseParser


class Verdict(BaseModel):
    ok: bool


def _model_returning(result):
    model = MagicMock()
    model.with_structured_output.return_value.invoke.return_value = result
    return model


def test_structured_calls_keep_token_usage():
    raw = AIMessage(
        content="",
        usage_metadata={"input_tokens": 120, "output_tokens": 30, "total_tokens": 150},
    )
    model = _model_returning({"raw": raw, "parsed": Verdict(ok=True), "parsing_error": None})

    with patch.object(executor.llm_manager, "get_model", return_value=model), patch.object(
        executor.llm_manager, "fallback_order", return_value=["google"]
    ):
        result = executor.llm_executor.invoke_structured(messages=[], schema=Verdict)

    model.with_structured_output.assert_called_once_with(Verdict, include_raw=True)
    assert result.model_dump() == {"ok": True}
    assert result.ok is True
    assert ResponseParser.usage(result) == {
        "input_tokens": 120,
        "output_tokens": 30,
        "total_tokens": 150,
    }


def test_unparsed_structured_output_is_an_error_and_retried():
    model = _model_returning({"raw": AIMessage(content="nope"), "parsed": None, "parsing_error": "bad json"})

    with patch.object(executor.llm_manager, "get_model", return_value=model), patch.object(
        executor.llm_manager, "fallback_order", return_value=["google"]
    ), patch.object(executor.time, "sleep"):
        try:
            executor.llm_executor.invoke_structured(messages=[], schema=Verdict)
        except executor.LLMExecutionException:
            pass
        else:
            raise AssertionError("expected LLMExecutionException")

    assert model.with_structured_output.return_value.invoke.call_count == 2
