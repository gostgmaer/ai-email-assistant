Extract all structured information explicitly present in the email thread — including headers, body, quoted text, and signatures.

- **people**: full names of all individuals mentioned or participating
- **emails**: all email addresses
- **phones**: all phone numbers
- **companies**: all organization or business names
- **dates**: all specific dates, deadlines, and time references (keep original phrasing)
- **urls**: all hyperlinks and URLs
- **tasks**: concrete action items — state what, who (if known), and by when (if known)
- **meeting_requests**: any meeting proposal — include time/date, platform/location, participants, and topic where stated

Rules: ground truth only — no inference or invention; deduplicate; return `[]` for any category with no matches. Return only structured output.