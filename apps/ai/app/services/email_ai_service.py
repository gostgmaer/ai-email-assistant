from app.capabilities.answer.graph import answer_graph
from app.capabilities.answer.schemas import AnswerRequest, AnswerResponse
from app.capabilities.commitments.graph import commitments_graph
from app.capabilities.commitments.schemas import (
    CommitmentsRequest,
    CommitmentsResponse,
)
from app.capabilities.reply.graph import reply_graph
from app.capabilities.reply.schemas import (
    ReplyRequest,
    ReplyResponse,
)

from app.capabilities.summarize.graph import summarize_graph
from app.capabilities.summarize.schemas import (
    SummarizeRequest,
    SummarizeResponse,
)
from app.capabilities.classify.schemas import ClassifyRequest, ClassifyResponse
from app.capabilities.classify.graph import classify_graph
from app.capabilities.extract.schemas import ExtractRequest, ExtractResponse
from app.capabilities.extract.graph import extract_graph
from app.capabilities.rewrite.schemas import RewriteRequest, RewriteResponse
from app.capabilities.rewrite.graph import rewrite_graph
from app.capabilities.contact_memory.schemas import (
    ContactMemoryRequest,
    ContactMemoryResponse,
)
from app.capabilities.contact_memory.graph import contact_memory_graph
from app.capabilities.validate_reply.schemas import (
    ValidateReplyRequest,
    ValidateReplyResponse,
)
from app.capabilities.validate_reply.graph import validate_reply_graph
class EmailAIService:
    """Email AI service."""

    async def reply(
        self,
        request: ReplyRequest,
    ) -> ReplyResponse:

        result = await reply_graph.ainvoke(request.model_dump())

        return ReplyResponse(
            draft=result["draft"],
            provider=result["provider"],
            model=result["model"],
            usage=result["usage"],
        )

    async def summarize(
        self,
        request: SummarizeRequest,
    ) -> SummarizeResponse:

        result = await summarize_graph.ainvoke(request.model_dump())

        return SummarizeResponse(
            summary=result["summary"],
            key_points=result["key_points"],
            provider=result["provider"],
            model=result["model"],
            usage=result["usage"],
        )

    async def answer(
        self,
        request: AnswerRequest,
    ) -> AnswerResponse:

        result = await answer_graph.ainvoke(request.model_dump())

        return AnswerResponse(
            answer=result["answer"],
            citations=result["citations"],
            found=result["found"],
            provider=result["provider"],
            model=result["model"],
            usage=result["usage"],
        )

    async def commitments(
        self,
        request: CommitmentsRequest,
    ) -> CommitmentsResponse:

        result = await commitments_graph.ainvoke(request.model_dump())

        return CommitmentsResponse(
            commitments=result["commitments"],
            provider=result["provider"],
            model=result["model"],
            usage=result["usage"],
        )

    async def classify(
            self,
            request: ClassifyRequest,
        ) -> ClassifyResponse:

        result = await classify_graph.ainvoke(request.model_dump())

        return ClassifyResponse(
            classification=result["classification"],
            provider=result["provider"],
            model=result["model"],
            usage=result["usage"],
        )
    async def extract(
    self,
    request: ExtractRequest,
) -> ExtractResponse:

        result = await extract_graph.ainvoke(
        request.model_dump()
    )

        return ExtractResponse(
        extraction=result["extraction"],
        provider=result["provider"],
        model=result["model"],
        usage=result["usage"],
    )
    async def rewrite(
    self,
    request: RewriteRequest,
) -> RewriteResponse:
        """Rewrite an email."""

        result = await rewrite_graph.ainvoke(
        request.model_dump()
    )

        return RewriteResponse(
        rewritten_draft=result["rewritten_draft"],
        provider=result["provider"],
        model=result["model"],
        usage=result["usage"],
    )

    async def contact_memory(
        self,
        request: ContactMemoryRequest,
    ) -> ContactMemoryResponse:
        """Extract sender facts and an embedding for contact memory."""

        result = await contact_memory_graph.ainvoke(request.model_dump())

        return ContactMemoryResponse(
            facts=result["facts"],
            embedding=result["embedding"],
            provider=result["provider"],
            model=result["model"],
            usage=result["usage"],
        )

    async def validate_reply(
        self,
        request: ValidateReplyRequest,
    ) -> ValidateReplyResponse:
        """Check a drafted reply against its thread before it's allowed to
        auto-send."""

        result = await validate_reply_graph.ainvoke(request.model_dump())

        return ValidateReplyResponse(
            validation=result["validation"],
            provider=result["provider"],
            model=result["model"],
            usage=result["usage"],
        )

email_ai_service = EmailAIService()
