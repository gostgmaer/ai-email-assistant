← [Back to index](/help)

# Tasks & Waiting

## What it is

Two lists the app fills in for you from your email. You don't add things to them yourself; you just act on what's there.

- **Tasks** — action items and meeting requests the AI noticed inside your mail, and promises you made in mail you sent.
- **Waiting** — threads where *you* sent the last message and haven't heard back yet.

## Where to find it

**Tasks** and **Waiting**, in the menu on the left.

---

## Tasks

![The Tasks page with a You promised task, an Action item and a Meeting request](/help-images/tasks.png)

**Tabs:** **Pending** (shown first), **Done**, **Dismissed** and **All**. Tasks with a due date come first, soonest first; the rest are newest first.

**The four kinds of task:**

| Label | Where it comes from | Example |
|---|---|---|
| **Action item** | Someone asked you to do something in an email | *"Update Brightpath's address on future contracts"* |
| **Meeting request** | Someone asked to meet or talk | *"Call on Tuesday afternoon about the redesign"* |
| **You promised** | You promised something in an email **you** sent | *"Send Dana the corrected invoice"*, due Friday |
| **Follow-up** | Nobody answered an email you sent with a reminder set | *"No reply yet: Contract for sign-off"* |

Each task shows:
- Its label, and when it was found. If it has a due date, that's shown too, and an open task past its due date shows **Overdue since** in red.
- A one-line description written by the AI, such as *"Interview on Monday, August 10, 2026, at 3:00 PM"*.
- **View source email**, which opens the email it came from. Always check the email if the details matter: the AI can misread dates.
- **Done** and **Dismiss** buttons, or **Reopen** once a task is done or dismissed.
- On **Meeting request** tasks only, a **Suggest a time** button.

> **A good daily habit:** open **Tasks** each morning, click **Done** on what you've finished and **Dismiss** on anything that isn't really a task. A short list is a useful list.

### Marking a task Done or Dismissed

**How:** click **Done** (you handled it) or **Dismiss** (not relevant / don't need to act). The task moves out of the **Pending** list into the corresponding tab.

**What happens:** the task moves to the **Done** or **Dismissed** tab. Changed your mind? Open that tab and click **Reopen** to put it back in **Pending**. Nothing is sent to anyone either way.

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

**What happens on Confirm & schedule:** a real event is added to your Google or Outlook calendar. If you ticked **Invite attendee**, that person also gets a calendar invitation by email. You can delete the event from your calendar afterwards, but they'll already have been notified, so check the box and the address before confirming.

> **Tip:** the AI's suggested time is only a suggestion. Always check the date, the time and the title in the review panel before you confirm.

---

## Waiting

![The Waiting page with a thread four days old, and Draft follow-up, Remind me and Not waiting controls](/help-images/waiting.png)

**What it is:** a list of threads awaiting a reply — you sent the last message, and no one has responded since. The **All / 3+ days / 7+ days** filters narrow it by age.

Each row shows: how long it's been waiting, who it's waiting on, the subject (click to open the thread), and — if relevant — a pending meeting request or a **You promised: …** line.

**Example:** *"26 days waiting — Re: Proposal for the spring campaign"* tells you at a glance which conversation has gone quiet and might need a nudge.

> **Tip:** look at **7+ days** once a week. A short, friendly follow-up often gets the answer you're waiting for, and **Draft follow-up** writes one for you to check.

**What you can do on a row:**
- **Draft follow-up** opens the thread and has the AI write a short nudge in the reply box. Nothing is sent until you click **Send**.
- **Remind me in…** sets a reminder for this thread.
- **Not waiting** removes it from the list, with an **Undo**. If the thread gets a newer message, it can come back.

**Reminders:** when you send with **Remind me if no reply in N days** ([Compose](/help/03-compose)), and nobody has replied by then, a **Follow up** task *"No reply yet: <subject>"* appears on the Tasks page and you get a notification. A reply that arrives first cancels the reminder.
