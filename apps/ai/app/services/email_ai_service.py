from app.capabilities.reply.graph import reply_graph
from app.capabilities.reply.schemas import (
    ReplyRequest,
    ReplyResponse,
)


class EmailAIService:
    """Email AI service."""

    async def reply(
        self,
        request: ReplyRequest,
    ) -> ReplyResponse:
        """
        Generate email reply.
        """

        result = await reply_graph.ainvoke(
            request.model_dump()
        )

        return ReplyResponse(
            draft=result["draft"],
            provider=result["provider"],
            model=result["model"],
            usage=result["usage"],
        )


email_ai_service = EmailAIService()