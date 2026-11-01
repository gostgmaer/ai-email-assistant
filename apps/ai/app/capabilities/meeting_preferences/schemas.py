from pydantic import BaseModel, Field

MAX_CONTENT_LENGTH = 8000


class MeetingPreferencesSchema(BaseModel):
    title: str = ""
    duration_minutes: int = 30
    # ISO dates (YYYY-MM-DD) the requester asked for; null when they didn't
    # narrow it down.
    earliest_date: str | None = None
    latest_date: str | None = None
    part_of_day: str = "any"
    # "HH:MM" (24h) when the request names a time of day; otherwise null.
    preferred_time: str | None = None
    # The requester's IANA time zone, only when the email states it.
    other_timezone: str | None = None


class MeetingPreferencesRequest(BaseModel):
    description: str
    content: str = Field(default="", max_length=MAX_CONTENT_LENGTH)
    # Now on the user's clock, e.g. "Tuesday 2026-10-27 14:05".
    now: str
    # The same moment's date alone; no date may be earlier.
    today: str
    timezone: str = "UTC"


class TokenUsageSchema(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class MeetingPreferencesResponse(BaseModel):
    preferences: MeetingPreferencesSchema
    provider: str
    model: str
    usage: TokenUsageSchema
