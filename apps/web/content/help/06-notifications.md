← [Back to index](/help)

# Notifications

## What it is

System events you should know about — an urgent email, an approval waiting on you, an AI draft ready for review, a mailbox that stopped syncing, a follow-up reminder, a snoozed thread coming back, an auto-send on your behalf, and the daily digest. They appear in the app, and optionally by email or in a Slack channel.

## Where to find it

The bell at the top right of every page. A red number shows how many you haven't read, up to "9+".

## How to use it

1. Click the bell to open the dropdown.
2. Each entry shows a title and a short body, e.g.:
   - *"Sync failed — We couldn't sync you@example.com: …"*. See [Questions and problems](/help/17-faq-troubleshooting#email-isnt-showing-up) for what to do.
   - *"Auto-replied to an email — Sent from you@example.com — 'Re: Thank You for the Interview Opportunity'"*
   - *"Your daily digest — 7 unread emails · 17 pending tasks"*
3. Click a notification to mark it as read. This doesn't open the email: go to the page it mentions, such as **Inbox**, **Drafts** or **Approvals**, to act on it.
4. Click **Mark all read** at the top of the list to clear the red number in one go.
5. Click anywhere outside the list to close it.

## Every kind of notification

| Notification | When you get it | Who gets it |
|---|---|---|
| **Urgent email arrives** | A new email the AI judged **urgent** | The mailbox's owner |
| **Your approval is needed** | It's your turn to approve an AI reply, and again as a reminder halfway to its deadline | The approver whose turn it is |
| **AI draft ready for review** | The AI wrote a reply to a new email and it's waiting for you in Drafts | The mailbox's owner |
| **A mailbox stops syncing** | Straight away if the mailbox's sign-in stopped working (*"Reconnect your mailbox"*), or after 3 failed syncs in a row for any other reason (*"Sync failing"*) | The mailbox's owner |
| **Daily digest** | Once a day at the hour you chose: your unread emails, how many are high priority, and your open tasks. Skipped on days with nothing unread and no open tasks | Everyone, for the mailboxes they own |
| **No reply to a message you sent** | Nobody answered an email you sent with **Remind me if no reply in**. A follow-up task is added too | The person it's assigned to, or else the owner |
| **A snoozed thread is back** | A snoozed email returns to the Inbox | The person it's assigned to, or else the owner |
| **A promise you made is due** | Something you promised in an email you sent (*"I'll send it by Friday"*) is due and not marked done | You |
| **Auto-replies and other automation** | The AI sent a reply on its own, a scheduled send was stopped, a sending limit was reached, or similar | The mailbox's owner |

> **On a shared mailbox,** most alerts about the mailbox go to its **owner**. Members are told about approvals waiting on them, and about snoozed or unanswered emails assigned to them.

> **If you're new to the app,** keep **In app** on for *Auto-replies and other automation* and *A mailbox stops syncing*. They're the two you most need to know about.

## Example

Getting *"Auto-replied to an email"* tells you the AI sent a reply for you without anyone checking it first. This only happens when the mailbox's owner has a [rule](/help/07-settings-accounts#workflow-rules) set to **Auto-send the AI reply**, and the reply passed the app's safety checks: no blocked phrases, within the limits, and the AI was confident it's correct and doesn't make things up. Open the email to read what was sent.

## Choosing where notifications go

**Where:** **Settings → Profile → Notifications** ([Profile](/help/09-settings-profile)).

**How:**
1. Each kind of notification has three boxes: **In app**, **Email**, **Slack**. In app is on by default; email and Slack are off.
2. Ticking any **Slack** box shows **Post to Slack via** — pick a mailbox, then its Slack workspace, then a channel. **Save notifications** stays disabled until a channel is chosen.
3. **Send the daily digest at** — the hour, in your own timezone.
4. Click **Save notifications**.

**Example:** tick **Email** and **Slack** for *Urgent email arrives*, choose `#support`, and save: an urgent email now shows in the bell, arrives as an email from the app, and posts to `#support`.

**Good to know:**
- Email notifications come from the app's own address, not from your mailbox. If they don't arrive, check your spam folder.
- Unticking **In app** for a kind of notification stops it appearing in the bell.
- Unticking all three boxes turns that kind of notification off completely.
- Slack notifications go to a channel, so everyone in that channel sees them. Choose a private channel for anything personal.

**Suggested settings:**

| If you… | Tick |
|---|---|
| Check the app a few times a day | **In app** for everything |
| Mostly live in your normal email | **Email** for *Urgent email arrives*, *Your approval is needed* and *A mailbox stops syncing* |
| Work as a team in Slack | **Slack** for *Urgent email arrives*, posting to your team's channel |

## What happens

- Notifications are personal. **Mark all read** only affects yours, never a teammate's, even on a shared mailbox.
- Notifications are informational only; nothing about reading or dismissing them affects mail or drafts.
