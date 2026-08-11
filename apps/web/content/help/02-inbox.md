← [Back to index](/help)

# Inbox

## What it is

A unified inbox across every connected mailbox, with an AI reply assistant, internal team notes, snoozing, and one-click thread summaries.

## Where to find it

**Inbox** in the left sidebar (also the default landing page). The page is split: a filterable thread list on the left, and the open thread on the right.

---

## Reading and filtering mail

**Where:** top of the thread list — folder tabs (**Inbox / Sent / Drafts / Archive / Spam / Trash / Snoozed**) and a **priority** dropdown (Any priority / Urgent / High / Medium / Low).

**How:** click a folder tab to switch folders; use the search box at the very top of the page (`Search email…`) to search by keyword — this searches within the currently open folder context and navigates to `/inbox?q=<your text>`.

**Example:** click **Drafts** to see every AI-generated or manually saved draft waiting for review, across all connected accounts.

---

## Opening a thread

**How:** click any row in the thread list.

**What happens:** the right-hand pane loads every message in that thread in chronological order, each showing sender, recipient, timestamp, and body. If a reply was AI-generated using one of your uploaded [Documents](/help/05-documents), you'll see a **"Grounded in your documents"** badge on that message — hover it to see which files it drew from. If it was drafted for a meeting/scheduling request, you may also see a **"Calendar-aware"** badge — see [Calendar-aware replies](/help/07-settings-accounts#calendar-aware-replies).

---

## AI Reply

**What it is:** generates a complete draft reply based on the whole thread, using your connected [Documents](/help/05-documents) for grounding when relevant, and following the [Workflow rule](/help/07-settings-accounts#workflow-rules) / [AI Agent persona](/help/07-settings-accounts#ai-agents-personas) that applies to this account.

**Where:** the reply box at the bottom of an open thread — **AI Reply** button, next to **Rewrite** and **Send**.

**How to use it:**
1. Open a thread.
2. Click **AI Reply**.
3. Wait a few seconds — the reply textbox fills in with a complete draft.
4. Edit freely before sending, or click **Rewrite** to have the AI adjust tone/wording of what's currently in the box.
5. Click **Send** when ready — this sends a real email through the connected account's provider (Gmail/Outlook/SMTP).

**Example:** on a thread confirming an interview time, clicking **AI Reply** produced:
> *"Dear Kishor, Thank you for confirming the meeting. I have received the calendar invite and look forward to..."*

**What happens:** nothing is sent until you click **Send**. Drafting is 100% safe to try — it only fills the local textbox.

---

## Summarize

**What it is:** a one-paragraph AI summary of the entire thread, useful for long back-and-forth conversations.

**Where:** **Summarize** button, top-right of an open thread.

**How:** click it. A blue **AI Summary** banner appears above the messages within a few seconds.

**Example:** *"Kishor Sarkar and the hiring manager have confirmed the details for an upcoming job interview for the Full-stack Software Engineer position."*

**What happens:** nothing is saved — it's a one-time, in-memory summary for this viewing session. Reload the page and it's gone; click **Summarize** again to regenerate.

---

## Notes (internal, team-only)

**What it is:** a place to leave notes on a thread that are **never sent** to the other party — visible only to people who share this account's inbox (see [Members](/help/07-settings-accounts#shared-inbox-members)).

**Where:** **Notes** button, top-right of an open thread.

**How to use it:**
1. Click **Notes** to open the panel (shows "INTERNAL NOTES — NEVER SENT, ONLY VISIBLE TO THIS ACCOUNT'S SHARED INBOX MEMBERS").
2. Type in the **"Add a note for your team…"** box.
3. Click **Add** (or press Enter inside the form).
4. To remove a note, click **Delete** next to it.

**Example:** a teammate leaves the note *"Called them, they'd prefer a Tuesday instead — waiting on their reply before we reschedule."* — visible to every Shared Inbox member on this account, invisible to the actual email recipient.

**What happens:** the note is saved against the thread (`ThreadNote`), timestamped, and attributed to whichever user added it.

---

## Snooze

**What it is:** temporarily hides a thread from the main Inbox and resurfaces it later.

**Where:** the **Snooze…** dropdown, top-right of an open thread.

**How:** pick one of the presets — **Later today (+3h)**, **Tomorrow morning**, or **Next week**. The thread immediately disappears from Inbox and you're returned to the thread list. To find it again before it resurfaces, check the **Snoozed** folder tab, where an **"Snoozed — unsnooze"** button lets you bring it back early.

**Example:** snoozing a "let me check my calendar and get back to you" thread until **Tomorrow morning** so it doesn't clutter today's inbox but isn't lost either.

---

## Assigning a thread (Shared Inbox only)

**What it is:** hands a thread off to a specific teammate. Only appears once an account has more than one [Member](/help/07-settings-accounts#shared-inbox-members).

**Where:** a dropdown next to the account badge at the top of an open thread, labeled with the current assignee (or "Unassigned").

**How:** open the dropdown, pick a teammate's name (or "Unassigned" to clear it).

**What happens:** the thread's `assignedTo` field updates immediately; anyone with access to the shared account can see who owns it.
