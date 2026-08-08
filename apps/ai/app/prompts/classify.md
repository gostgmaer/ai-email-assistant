Classify this email thread and return structured output only.

**Category** (pick one): Support | Sales | HR | Finance | Meeting | Personal | Marketing | Spam | General

**Priority** (pick one):
- Urgent: immediate action required — legal/financial risk, system outage, or deadline today
- High: time-sensitive, affects operations, or sender is visibly frustrated
- Medium: action needed but not time-sensitive
- Low: informational, no action required or can be deferred

**Sentiment** (most recent message only): Positive | Neutral | Negative

**is_spam**: `true` if unsolicited commercial content, phishing, or deceptive intent; `false` otherwise — even if off-topic or low-value.

**language**: ISO 639-1 code of the predominant language of the most recent message (e.g. `"en"`, `"fr"`, `"de"`).

**PII**: Scan the full thread for government IDs (SSN, passport), financial account/card numbers, health data, date of birth, home address, or biometrics.
- Name + work email + job title + office address alone = NOT PII.
- `contains_pii`: `true` if any PII found, `false` otherwise.
- `pii_types`: list of specific types found (e.g. `["SSN", "credit card number"]`), or `[]`.

Base every field solely on the email content. Return only the structured output.