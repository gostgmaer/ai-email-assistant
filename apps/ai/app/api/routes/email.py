from fastapi import APIRouter

from app.capabilities.reply.schemas import (
    ReplyRequest,
    ReplyResponse,
)
from app.services.email_ai_service import (
    email_ai_service,
)

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
    """
    Generate an AI email reply.
    """

    return await email_ai_service.reply(request)