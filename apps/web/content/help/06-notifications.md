← [Back to index](/help)

# Notifications

## What it is

System events you should know about — an urgent email, an approval waiting on you, an AI draft ready for review, a mailbox that stopped syncing, a follow-up reminder, a snoozed thread coming back, an auto-send on your behalf, and the daily digest. They appear in the app, and optionally by email or in a Slack channel.

## Where to find it

The bell icon, top-right of every page. A red badge shows your unread count (caps at "9+").

## How to use it

1. Click the bell to open the dropdown.
2. Each entry shows a title and a short body, e.g.:
   - *"Sync failed — We couldn't sync you@example.com: Gmail API error (400)..."*
   - *"Auto-replied to an email — Sent from you@example.com — 'Re: Thank You for the Interview Opportunity'"*
   - *"Your daily digest — 7 unread emails · 17 pending tasks"*
3. Click an individual notification to mark just that one read.
4. Click **Mark all read** (top of the dropdown) to clear your unread badge in one action.

## Example

Getting *"Auto-replied to an email"* tells you the AI sent a reply on your behalf without you reviewing it first — this only happens when a [Workflow rule](/help/07-settings-accounts#workflow-rules) is set to **Auto-send the AI reply** and the reply passed all internal safety checks (policy, grammar, tone, confidence, and hallucination checks). Click through to the thread to review what was actually sent.

## Choosing where notifications go

**Where:** **Settings → Profile → Notifications** ([Profile](/help/09-settings-profile)).

**How:**
1. Each kind of notification has three boxes: **In app**, **Email**, **Slack**. In app is on by default; email and Slack are off.
2. Ticking any **Slack** box shows **Post to Slack via** — pick a mailbox, then its Slack workspace, then a channel. **Save notifications** stays disabled until a channel is chosen.
3. **Send the daily digest at** — the hour, in your own timezone.
4. Click **Save notifications**.

**Example:** tick **Email** and **Slack** for *Urgent email arrives*, choose `#support`, and save: an urgent email now shows in the bell, arrives as an email from the app, and posts to `#support`.

**Good to know:** email notifications come from the app's own address, not your mailbox. Unticking **In app** for a kind of notification stops it appearing in the bell.

## What happens

- Notifications are per-user, not per-account — **Mark all read** only affects notifications belonging to you, never a teammate sharing an account with you.
- Notifications are informational only; nothing about reading or dismissing them affects mail or drafts.
