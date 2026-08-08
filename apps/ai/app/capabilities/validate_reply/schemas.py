from pydantic import BaseModel
from pydantic import EmailStr


class EmailMessageSchema(BaseModel):
    name: str
    email: EmailStr
    content: str


class ReplyValidationSchema(BaseModel):
    addresses_thread: bool
    # Empty when addresses_thread is true and nothing else is notable.
    # Free-text, not a fixed enum — same loosely-typed convention as
    # ClassificationSchema's category/priority/sentiment.
    concerns: list[str]
    # Empty when there are no grammar/spelling/broken-sentence issues.
    # Objective enough to hard-gate auto-send on (unlike tone, below).
    grammar_issues: list[str]
    # Whether the tone fits the thread (e.g. not cold/curt in reply to an
    # upset customer, not overly casual for a formal request). Softer/more
    # subjective than grammar_issues — informational only, does not gate
    # auto-send on its own (see AiProcessingProcessor).
    tone_appropriate: bool
    tone_note: str
    # 0-100 self-reported confidence that this reply is safe to send
    # with no human review. Deliberately the model's own judgment, not a
    # separate classifier — see docs/enterprise-ai-pipeline-plan.md §6 for
    # why this was the chosen source.
    confidence: int


class TokenUsageSchema(BaseModel):
    input_tokens: int
    output_tokens: int
    total_tokens: int


class ValidateReplyRequest(BaseModel):
    subject: str
    thread: list[EmailMessageSchema]
    draft_reply: str


class ValidateReplyResponse(BaseModel):
    validation: ReplyValidationSchema
    provider: str
    model: str
    usage: TokenUsageSchema
