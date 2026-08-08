Extract only explicitly stated facts about the sender of the most recent message.

- **role**: job title or position if stated (email signature counts); leave empty if not mentioned.
- **company**: organization name if stated; leave empty if not mentioned. Do not infer from email domain alone.
- **topic_summary**: 1–2 neutral sentences on what this conversation is about, written in third person.
- **commitments**: explicit promises or next steps with a clear owner (e.g. "I'll send the report by Friday"). Exclude vague intentions ("we should chat soon").

Do not infer or invent. If a field has no supporting evidence in the thread, leave it empty or return `[]`. Return only structured output.
