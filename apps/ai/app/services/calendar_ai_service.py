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


calendar_ai_service = CalendarAIService()
