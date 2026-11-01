← [Back to index](/help)

# Tasks & Waiting

## What it is

Two automatically-populated lists, pulled from your mail by AI — you never manually create these, only act on them:

- **Tasks** — action items and meeting requests the AI noticed inside your mail, and promises you made in mail you sent.
- **Waiting** — threads where *you* sent the last message and haven't heard back yet.

## Where to find it

**Tasks** and **Waiting** in the left sidebar.

---

## Tasks

**Sub-filters:** **Pending** (default) / **Done** / **Dismissed** / **All**. Tasks with a due date come first, soonest due; the rest are newest first.

Each task shows:
- A type pill — **Meeting request**, **Action item**, **Follow-up** or **You promised**.
- The time it was extracted, and the due date if it has one. An open task past its due date shows **Overdue since** in red.
- A one-line description written by the AI (e.g. *"Interview on Monday, August 10, 2026, at 3:00 PM"*).
- **View source email** — jumps to the exact thread it came from.
- **Done** / **Dismiss** buttons (and **Reopen** once a task is Done or Dismissed).
- For **Meeting request** tasks only: a **Suggest a time** button.

### Marking a task Done or Dismissed

**How:** click **Done** (you handled it) or **Dismiss** (not relevant / don't need to act). The task moves out of the **Pending** list into the corresponding tab.

**What happens:** `Task.status` updates to `DONE` or `DISMISSED`; `Done` also stamps `completedAt`. Both are reversible — open the **Done** or **Dismissed** tab and click **Reopen** to send it back to Pending.

### You promised (commitments)

**What it is:** when mail you send contains a clear promise, it becomes a task with its due date, so it doesn't get forgotten.

**Example:** you write *"I'll send the deck by Friday."* A **You promised** task appears, due that Friday at 17:00 on your clock. A vague line like *"let's catch up sometime"* creates nothing, and neither does a request you make of someone else.

**What happens:** your recent sent mail is read every few minutes, and only the last 14 days of it. When a promise falls due and the task is still pending, you get one **A promise is due** notification. Marking it **Done** or **Dismiss** stops the reminder. Due dates use the timezone in your [Profile](/help/09-settings-profile), so check it's set. The same promise shows as **You promised: …** on that thread in **Waiting**.

### Suggest a time (AI meeting scheduling)

To offer the other person a choice of times instead, use [Propose times](/help/02-inbox#meeting-requests-propose-times) on the thread.

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

## Waiting

**What it is:** a list of threads awaiting a reply — you sent the last message, and no one has responded since. The **All / 3+ days / 7+ days** filters narrow it by age.

Each row shows: how long it's been waiting, who it's waiting on, the subject (click to open the thread), and — if relevant — a pending meeting request or a **You promised: …** line.

**Example:** *"26 days waiting — Re: Agentic AI Development Training with LangGraph learning program"* tells you at a glance which outreach has gone cold and might need a nudge.

**What you can do on a row:**
- **Draft follow-up** opens the thread and has the AI write a short nudge in the reply box. Nothing is sent until you click **Send**.
- **Remind me in…** sets a reminder for this thread.
- **Not waiting** removes it from the list, with an **Undo**. If the thread gets a newer message, it can come back.

**Reminders:** when you send with **Remind me if no reply in N days** ([Compose](/help/03-compose)), and nobody has replied by then, a **Follow up** task *"No reply yet: <subject>"* appears on the Tasks page and you get a notification. A reply that arrives first cancels the reminder.
