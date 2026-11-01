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

## Needs reply, FYI, Notifications and Newsletters

**What it is:** the Inbox folder is split into groups, so what needs you stands out.

**Where:** the chips under the folder tabs. They only show on **Inbox**.

| Group | What's in it |
|---|---|
| **All** | Everything in the Inbox |
| **Needs reply** | Someone is waiting on an answer from you |
| **FYI** | Worth reading but no answer expected, such as mail you were only copied on, a "thanks", or a thread where you sent the last message |
| **Notifications** | Automated mail, such as receipts and account alerts |
| **Newsletters** | Mailing-list and marketing mail, only if [Keep newsletters](/help/07-settings-accounts#keep-newsletters) is on |

**What happens:** each thread is grouped by its newest message and updates as new mail arrives. Sorting never moves or changes anything in your real mailbox.

![The Inbox with the All, Needs reply, FYI and Notifications chips above a list of threads](/help-images/inbox-groups.png)

---

## Unsubscribe

**Where:** a newsletter thread shows an **Unsubscribe…** button above the messages.

**How:** click **Unsubscribe…**, then pick from what the sender offers:
- **Unsubscribe in one click**, then **Yes, unsubscribe**: the app does it for you.
- **Open the sender's unsubscribe page**: opens their page, where you finish it.
- **Email an unsubscribe request**: opens Compose with the request filled in. Nothing is sent until you click **Send**.

**What happens:** this really does act on your behalf with the sender, so it always asks first. The sender may take a few days to stop. If they don't include a way to unsubscribe, the app tells you.

---

## Clean up newsletters

**Where:** the **Newsletters** group in the Inbox.

**How:** choose how old under **Clean up newsletters older than**. The app shows how many that matches. Click **Archive N** to confirm, or **Cancel**.

**What happens:** those threads are archived in your real mailbox. They aren't deleted: you can still find them in your mailbox's archive.

---

## Meeting requests: Propose times

**What it is:** when a thread has a meeting request, the app offers free times from your calendar in one click, then books the one the other person picks. It needs a connected [calendar](/help/08-settings-calendars).

**Where:** a blue **Meeting request** card at the top of the thread.

**How to use it:**
1. Click **Propose times**. Free times are written into the reply box. Nothing is sent or booked.
2. Edit the text if you like, then click **Send**.
3. When they answer, the card marks the time they chose as **Their pick**, usually within a few minutes.
4. Check the time and title, then click **Create event**.

If the app didn't recognise their answer, or they replied in a way it can't read, pick the time on the card yourself. **Propose new times** starts over with fresh times.

![A Meeting request card with three times, the 2:00 PM one marked Their pick, an event title, the Invite option and a Create event button](/help-images/meeting-card.png)

**Example:** Priya writes *"Can we talk Tuesday afternoon? I'm in Berlin."* **Propose times** writes:

> Here are a few times that work for me:
>
> - Tuesday, Nov 3, 12:00 PM GMT+5:30 (Tue, 7:30 AM GMT+1)
> - Tuesday, Nov 3, 2:00 PM GMT+5:30 (Tue, 9:30 AM GMT+1)
> - Tuesday, Nov 3, 4:00 PM GMT+5:30 (Tue, 11:30 AM GMT+1)
>
> Let me know which suits you best.

**What happens:**
- **Which times:** only free time on your calendar, on weekdays between 9:00 and 17:00 on your clock, up to two weeks ahead, respecting the day and time they asked for where possible.
- **Time zones:** your own are from your [Profile](/help/09-settings-profile), or your browser's if your profile is still on UTC. Theirs appears in brackets only if their email states it.
- **Create event:** creates a real event on your calendar and marks the meeting request done. With **Invite** ticked, the person also gets a calendar invite and a short confirmation reply in this thread. Untick it to only block your own time.

---

## Opening a thread

**How:** click any row in the thread list.

**What happens:** the right-hand pane loads every message in that thread in chronological order, each showing sender, recipient, timestamp, and body. Opening a thread marks it read, in the app and in your real mailbox.

**Attachments** appear as chips under a message (📎 name and size). Click one to download it — the file is fetched from your mailbox at that moment.

**"No reply needed"** — a grey badge on a message the AI decided needs no answer (a thank-you, or mail you were only Cc'd on), with the reason. No AI draft is made for it; you can still reply yourself. If a reply was AI-generated using one of your uploaded [Documents](/help/05-documents), you'll see a **"Grounded in your documents"** badge on that message — hover it to see which files it drew from. If it was drafted for a meeting/scheduling request, you may also see a **"Calendar-aware"** badge — see [Calendar-aware replies](/help/07-settings-accounts#calendar-aware-replies).

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

**When the time comes:** the thread returns to the Inbox by itself and you get a *"A snoozed conversation is back"* notification (the assignee gets it on a shared inbox).

**The Snoozed tab** lists snoozed threads from every folder, whatever folder you had open.

**Example:** snoozing a "let me check my calendar and get back to you" thread until **Tomorrow morning** so it doesn't clutter today's inbox but isn't lost either.

---

## Assigning a thread (Shared Inbox only)

**What it is:** hands a thread off to a specific teammate. Only appears once an account has more than one [Member](/help/07-settings-accounts#shared-inbox-members).

**Where:** a dropdown next to the account badge at the top of an open thread, labeled with the current assignee (or "Unassigned").

**How:** open the dropdown, pick a teammate's name (or "Unassigned" to clear it).

**What happens:** the thread's `assignedTo` field updates immediately; anyone with access to the shared account can see who owns it.

---

## AI drafts that send by themselves (Cancel send)

**What it is:** when a rule auto-sends a reply but there's a wait first — an [undo window](/help/07-settings-accounts#automation-settings), quiet hours, or a rule's **Delay the auto-reply** — the reply waits as a draft under the message it answers.

**Where:** the draft card under the message reads **"AI reply — sending automatically"** and *"Sends at <time> unless you cancel."*

**How:** click **Cancel send** to keep it as an ordinary draft for review. Editing the draft, sending it yourself, or discarding it also cancels the automatic send — it can never go out twice.

**What happens:** if you do nothing, it sends at the time shown. If auto-sending is switched off for the account before then, it isn't sent and you get a notification instead.

---

## Discarding an AI draft

**How:** click **Discard** on a draft under a message, then say why: **Wrong facts**, **Wrong tone**, **Shouldn't reply**, **Too long** or **Other**. **Just discard** skips the question, and **Keep it** keeps the draft.

![An AI draft after clicking Discard, showing the reason chips, Just discard and Keep it](/help-images/discard-reasons.png)

**What happens:** the draft is deleted. Your reason helps the app find patterns and propose fixes on the [Suggestions](/help/13-suggestions) page.

