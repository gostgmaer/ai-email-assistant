← [Back to index](/help)

# Settings → Calendars

## What it is

Connects Google Calendar or Outlook Calendar so the app can read your free/busy time — used by [Tasks → Suggest a time](/help/04-tasks-and-followups#suggest-a-time-ai-meeting-scheduling) to propose meeting slots that don't clash with anything already on your calendar, and to create real events once you confirm.

> This connects the calendar and reads busy/free time (and creates events via the Tasks scheduling flow) — it's a separate connection from your [email accounts](/help/07-settings-accounts), even if it's the same Google/Microsoft account.

## Where to find it

**Settings → Calendars** in the left sidebar (`/settings/calendar-accounts`).

## How to use it

1. Click **Connect Google Calendar** or **Connect Outlook Calendar**.
2. Approve the real Google/Microsoft consent screen.
3. You're returned with a confirmation banner: *"Connected `<n>` calendar."*
4. The account appears in a list, showing its email and provider, with a **Primary** badge if it's your first one.

### Checking availability

**How:** click **Check availability (next 7 days)** on a connected calendar.

**What happens:** a list of busy time intervals for the next 7 days appears below the account, e.g. *"Aug 10, 2026, 2:00 PM – Aug 10, 2026, 2:30 PM."* If there's nothing booked, it shows *"No busy intervals in the next 7 days."* This is a read-only check — nothing is created.

### Disconnecting

**How:** click **Disconnect**, confirm the prompt.

**What happens:** the app can no longer read this calendar's availability or create events on it. Existing events already created are untouched (they live in the real calendar, not in this app).
