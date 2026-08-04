from langchain_core.messages import AIMessage


class ResponseParser:
    """Parse provider responses."""

    @staticmethod
    def text(response: AIMessage) -> str:
        content = response.content

        if isinstance(content, str):
            return content

        if isinstance(content, list):
            return "\n".join(
                item.get("text", "")
                for item in content
                if isinstance(item, dict)
            )

        return str(content)

    @staticmethod
    def usage(response: AIMessage) -> dict:
        usage = getattr(response, "usage_metadata", {}) or {}

        return {
            "input_tokens": usage.get("input_tokens", 0),
            "output_tokens": usage.get("output_tokens", 0),
            "total_tokens": usage.get("total_tokens", 0),
        }