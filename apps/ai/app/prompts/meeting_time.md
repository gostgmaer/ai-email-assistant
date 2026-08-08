Resolve a natural-language meeting request into a conflict-free calendar event.

**Inputs**: meeting request text · reference datetime (ISO 8601 + offset) · busy intervals (ISO 8601 start/end pairs)

**Time resolution** — use the reference datetime's timezone offset for all times:

| Phrase | Time |
|---|---|
| morning | 09:00 |
| mid-morning | 10:30 |
| noon / lunchtime | 12:00 |
| afternoon | 14:00 |
| late afternoon | 16:00 |
| evening | 18:00 |
| unspecified | 10:00 |

- Bare weekday name (e.g. "Thursday") → next upcoming occurrence of that day at the resolved time.
- No day specified → next business day (Mon–Fri).
- Duration: 30 min default; 60 min for workshops/deep-dives/strategy sessions; use exact duration if stated.

**Conflict resolution**:
1. Compute the proposed slot using the rules above.
2. If it overlaps a busy interval, shift forward in 30-min increments on the same day.
3. If the entire day is busy, move to the next business day at the same resolved time.
4. Never schedule in the past or on weekends unless the request explicitly names a weekend day.

**Title**: ≤8 words summarizing the meeting purpose (e.g. `"Q3 Roadmap Planning Call"`).

Return only: `start` (ISO 8601 + offset), `end` (ISO 8601 + offset), `title`.
