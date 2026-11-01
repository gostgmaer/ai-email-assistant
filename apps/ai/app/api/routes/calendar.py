from fastapi import APIRouter

from app.capabilities.meeting_pick.schemas import (
    MeetingPickRequest,
    MeetingPickResponse,
)
from app.capabilities.meeting_preferences.schemas import (
    MeetingPreferencesRequest,
    MeetingPreferencesResponse,
)
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


@router.post(
    "/meeting-preferences",
    response_model=MeetingPreferencesResponse,
)
async def meeting_preferences(
    request: MeetingPreferencesRequest,
) -> MeetingPreferencesResponse:
    """Read what a meeting request asks for (dates, part of day, length).
    apps/api picks the free slots from the real calendar."""

    return await calendar_ai_service.meeting_preferences(request)


@router.post(
    "/meeting-pick",
    response_model=MeetingPickResponse,
)
async def meeting_pick(request: MeetingPickRequest) -> MeetingPickResponse:
    """Read whether a reply accepts one of the meeting times offered."""

    return await calendar_ai_service.meeting_pick(request)
