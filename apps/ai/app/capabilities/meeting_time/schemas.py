from pydantic import BaseModel


class BusyIntervalSchema(BaseModel):
    start: str
    end: str


class MeetingTimeSchema(BaseModel):
    start: str
    end: str
    title: str


class TokenUsageSchema(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class SuggestMeetingTimeRequest(BaseModel):
    description: str
    reference_date: str
    busy: list[BusyIntervalSchema] = []


class SuggestMeetingTimeResponse(BaseModel):
    suggestion: MeetingTimeSchema
    provider: str
    model: str
    usage: TokenUsageSchema
