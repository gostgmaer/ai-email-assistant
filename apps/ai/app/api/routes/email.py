from fastapi import APIRouter

from app.capabilities.classify.schemas import ClassifyRequest, ClassifyResponse
from app.capabilities.extract.schemas import ExtractRequest, ExtractResponse
from app.capabilities.rewrite.schemas import RewriteRequest, RewriteResponse
from app.capabilities.summarize.schemas import SummarizeRequest, SummarizeResponse
from app.capabilities.reply.schemas import ReplyRequest, ReplyResponse
from app.services.email_ai_service import email_ai_service

router = APIRouter(
    prefix="/email",
    tags=["Email"],
)


@router.post(
    "/reply",
    response_model=ReplyResponse,
)
async def generate_reply(
    request: ReplyRequest,
) -> ReplyResponse:

    return await email_ai_service.reply(request)


@router.post(
    "/summarize",
    response_model=SummarizeResponse,
)
async def summarize_email(
    request: SummarizeRequest,
) -> SummarizeResponse:

    return await email_ai_service.summarize(request)


@router.post(
    "/classify",
    response_model=ClassifyResponse,
)
async def classify_email(
    request: ClassifyRequest,
) -> ClassifyResponse:

    return await email_ai_service.classify(request)


@router.post(
    "/extract",
    response_model=ExtractResponse,
)
async def extract_email(
    request: ExtractRequest,
) -> ExtractResponse:
    return await email_ai_service.extract(request)


@router.post(
    "/rewrite",
    response_model=RewriteResponse,
)
async def rewrite_email(
    request: RewriteRequest,
) -> RewriteResponse:
    """Rewrite an email draft."""

    return await email_ai_service.rewrite(request)
