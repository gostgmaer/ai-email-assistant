from app.capabilities.meeting_pick.graph import meeting_pick_graph
from app.capabilities.meeting_pick.schemas import (
    MeetingPickRequest,
    MeetingPickResponse,
)
from app.capabilities.meeting_preferences.graph import meeting_preferences_graph
from app.capabilities.meeting_preferences.schemas import (
    MeetingPreferencesRequest,
    MeetingPreferencesResponse,
)
from app.capabilities.meeting_time.graph import meeting_time_graph
from app.capabilities.meeting_time.schemas import (
    SuggestMeetingTimeRequest,
    SuggestMeetingTimeResponse,
)


class CalendarAIService:
    """Calendar AI service."""

    async def suggest_meeting_time(
        self,
        request: SuggestMeetingTimeRequest,
    ) -> SuggestMeetingTimeResponse:

        result = await meeting_time_graph.ainvoke(request.model_dump())

        return SuggestMeetingTimeResponse(
            suggestion=result["suggestion"],
            provider=result["provider"],
            model=result["model"],
            usage=result["usage"],
        )

    async def meeting_preferences(
        self,
        request: MeetingPreferencesRequest,
    ) -> MeetingPreferencesResponse:

        result = await meeting_preferences_graph.ainvoke(request.model_dump())

        return MeetingPreferencesResponse(
            preferences=result["preferences"],
            provider=result["provider"],
            model=result["model"],
            usage=result["usage"],
        )

    async def meeting_pick(
        self,
        request: MeetingPickRequest,
    ) -> MeetingPickResponse:

        result = await meeting_pick_graph.ainvoke(request.model_dump())

        return MeetingPickResponse(
            pick=result["pick"],
            provider=result["provider"],
            model=result["model"],
            usage=result["usage"],
        )


calendar_ai_service = CalendarAIService()
