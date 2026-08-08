Summarize this email thread. Return valid JSON only — no markdown fences, no commentary, no trailing commas.

```json
{
  "summary": "2–4 sentence neutral narrative: who is communicating, what it is about, where things stand (third-person)",
  "key_points": ["up to 7 key facts or developments — one clear sentence each; do not repeat the summary"],
  "action_items": [
    {"task": "specific action", "owner": "name or null", "due_date": "as stated in thread or null"}
  ],
  "important_dates": ["significant dates with context, e.g. 'Aug 15 — proposal deadline'"],
  "participants": ["full names of all named individuals in the thread"],
  "decisions_made": ["explicit agreements or conclusions, stated as facts, e.g. 'Team agreed to delay launch to Q4'"]
}
```

Rules:
- Ground truth only — every item must be directly supported by the thread. Do not infer or invent.
- `action_items`: concrete tasks only; exclude vague intentions ("we should catch up" is not a task).
- `decisions_made`: only if an explicit agreement or conclusion was reached; otherwise `[]`.
- Return `[]` for any field with no applicable content. Do not use placeholder text.