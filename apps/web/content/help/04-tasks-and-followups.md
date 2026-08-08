← [Back to index](/help)

# Tasks & Follow-ups

## What it is

Two automatically-populated lists, pulled from your inbox by AI classification — you never manually create these, only act on them:

- **Tasks** — action items and meeting requests the AI noticed inside your mail.
- **Follow-ups** — threads where *you* sent the last message and haven't heard back yet.

## Where to find it

**Tasks** in the left sidebar. Two tabs at the top switch between the two views: **Tasks** and **Follow-ups**.

---

## Tasks tab

**Sub-filters:** **Pending** (default) / **Done** / **Dismissed** / **All**.

Each task shows:
- A type pill — **Meeting request** or **Action item**.
- The time it was extracted.
- A one-line description written by the AI (e.g. *"Interview on Monday, August 10, 2026, at 3:00 PM"*).
- **View source email** — jumps to the exact thread it came from.
- **Done** / **Dismiss** buttons (and **Reopen** once a task is Done or Dismissed).
- For **Meeting request** tasks only: a **Suggest a time** button.

### Marking a task Done or Dismissed

**How:** click **Done** (you handled it) or **Dismiss** (not relevant / don't need to act). The task moves out of the **Pending** list into the corresponding tab.

**What happens:** `Task.status` updates to `DONE` or `DISMISSED`; `Done` also stamps `completedAt`. Both are reversible — open the **Done** or **Dismissed** tab and click **Reopen** to send it back to Pending.

### Suggest a time (AI meeting scheduling)

**What it is:** turns a detected meeting request into a real calendar event, using your connected [Calendar](/help/08-settings-calendars) to avoid double-booking — nothing is created until you explicitly confirm.

**How to use it:**
1. On a **Meeting request** task, click **Suggest a time**.
2. The AI checks your connected calendar's availability and proposes a **title**, **start time**, and **end time**, shown in an editable review panel with the note *"Suggested — review and edit before scheduling. Nothing is created until you confirm."*
3. Adjust the title/start/end freely if needed.
4. Optionally check **"Invite attendee (sends a real calendar invite email)"** and enter their address — leave unchecked to just block time on your own calendar.
5. Click **Confirm & schedule** to create the real event, or **Cancel** to discard the suggestion without creating anything.

**Example:** a task *"Interview on Monday, August 10, 2026, at 3:00 PM"* → Suggest a time proposes `Interview`, `08/10/2026 09:00 PM – 09:30 PM` (your local timezone) → Confirm & schedule creates the event on the connected Google/Outlook calendar and the task now shows a **"View scheduled meeting →"** link instead of the Suggest-a-time button.

**What happens on Confirm & schedule:** a real event is created via the connected calendar provider's API. If you checked "Invite attendee," a real calendar invitation email is sent to that address — this is the one part of this flow that is not silently reversible (the invitee gets notified), so double-check the checkbox before confirming.

---

## Follow-ups tab

**What it is:** a read-only list of threads awaiting a reply — you sent the last message, and no one has responded since.

Each row shows: how many days it's been waiting, the account it's on, the subject (click to open the thread), and — if relevant — a note about a related meeting request still pending.

**Example:** *"26 days waiting — Re: Agentic AI Development Training with LangGraph learning program"* tells you at a glance which outreach has gone cold and might need a nudge.

**What happens when you click a row:** takes you straight into the [Inbox](/help/02-inbox) thread view so you can reply, snooze, or use AI Reply directly.
