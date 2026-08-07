from fastapi import APIRouter

from app.capabilities.meeting_time.schemas import (
    SuggestMeetingTimeRequest,
    SuggestMeetingTimeResponse,
)
from app.services.calendar_ai_service import calendar_ai_service

router = APIRouter(
    prefix="/calendar",
    tags=["Calendar"],
)


@router.post(
    "/suggest-meeting-time",
    response_model=SuggestMeetingTimeResponse,
)
async def suggest_meeting_time(
    request: SuggestMeetingTimeRequest,
) -> SuggestMeetingTimeResponse:
    """Interpret a free-text meeting request into a concrete time slot that
    avoids the given busy intervals. Suggestion only — apps/api decides
    whether/when to actually write it to a calendar."""

    return await calendar_ai_service.suggest_meeting_time(request)
