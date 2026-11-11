← [Back to index](/help)

# Settings → Accounts

This is where you manage each connected mailbox: who can use it, what email comes in, and what the AI is allowed to do with it. Each mailbox has its own card with its own buttons, and its own settings. Changing one mailbox never changes another.

To connect a mailbox in the first place, see [Getting started](/help/01-getting-started).

> **Most of this page is for the mailbox's owner.** If you're a member of a shared mailbox, you'll only see some of these buttons; see [Who can do what](/help/15-working-as-a-team#who-can-do-what).

## Where to find it

**Settings → Accounts**, in the menu on the left.

## New here? Start simple

You don't need to set up anything on this page to start using the app. The defaults are safe: the AI writes drafts, and nothing is sent without you. When you're ready, these are the most useful settings, in order:

1. **Writing style** → **Build from sent mail**, so AI drafts sound like you. ([details](#writing-style))
2. **Sync filters**, to keep one-time codes, shipping updates and similar automatic mail out of your Inbox. ([details](#sync-filters))
3. **Members**, if colleagues work on this mailbox with you. ([details](#shared-inbox-members))
4. **Policy**, to list words that must never go out in an automatic reply, before you ever turn one on. ([details](#policy))

Workflow rules, Agents, Integrations and Approval Chains are **advanced**. Leave them until you're comfortable, and read [Safe use guidelines](/help/16-safe-use-guidelines#turning-on-automatic-replies-owners) before turning on any automatic replies.

## The buttons on a mailbox card

Some buttons only appear for the mailbox's **owner** (the person who connected it):

| Button | Who sees it | What it does |
|---|---|---|
| Sync now | everyone | Fetches new email now, instead of waiting for the next automatic check (about every 5 minutes) |
| Members | everyone | Shows who shares this mailbox. The owner can invite or remove people. [Details](#shared-inbox-members) |
| Contacts | everyone | Your contact list for this mailbox. [Details](#crm-contacts) |
| Writing style | everyone | How the AI writes to sound like you. Only the owner can change it. [Details](#writing-style) |
| Pause sync / Resume sync | owner only | Stops or restarts fetching new email. Your real mailbox is unaffected |
| Workflows | owner only | Opens [Workflow rules](#workflow-rules) |
| Automation | owner only | Opens [Automation settings](#automation-settings) — auto-send limits, undo window, quiet hours, business hours, signature |
| Activity | owner only | Opens [Activity](#activity) — the automation log and AI draft quality |
| Agents | owner only | Opens [AI Agents (personas)](#ai-agents-personas) |
| Integrations | owner only | Opens [Integrations](#integrations-slack-teams-hubspot) — connect Slack, Teams, or HubSpot for this account |
| Sync filters (N) | owner only | Opens [Sync filters](#sync-filters) — N = how many are currently active |
| Policy (N) | owner only | Opens [Policy](#policy) — N = how many prohibited phrases are set |
| Auto-schedule meetings (on/off) | owner only | Toggles automatic calendar scheduling — see [Tasks → Suggest a time](/help/04-tasks-and-followups#suggest-a-time-ai-meeting-scheduling) |
| Make primary | owner only | Makes this the mailbox chosen by default when you write a new email |
| Disconnect | owner only | Removes the mailbox from the app, after asking you to confirm. [Details](#disconnecting-a-mailbox) |

---

## Disconnecting a mailbox

**What it is:** removes a mailbox from the app completely. Only its owner can do this.

**How:** click **Disconnect** on the mailbox's card and confirm.

**What happens:**
- The mailbox disappears from the app for **everyone** who shared it, and the app stops reading and sending its email.
- The app's permission to use the mailbox is deleted, along with its writing style, its **Ask** search data, its suggestions and its insights.
- **Your real mailbox is not touched.** All your email is still in Gmail, Outlook or wherever it lives.
- If you connect the same mailbox again later, its rules, agents and members come back. Its writing style needs building again.

> If you only want to stop new email arriving for a while, use **Pause sync** instead.

---

## Sync filters

**What it is:** lets you exclude entire categories of automated mail from ever reaching your inbox or the AI, so promotional blasts, OTP codes, etc. don't clutter your inbox or waste AI processing.

**How to use it:**
1. Click **Sync filters (N)** on the account card.
2. You'll see six toggle pills: **Marketing**, **OTP codes**, **Password reset**, **Billing**, **Shipping**, **Calendar invites**.
3. Click a pill to highlight it (active/indigo) — highlighted categories are **excluded from sync entirely**: they never appear in your inbox and never reach the AI.
4. Click an already-active pill to turn it back on (let that category sync normally).

**Important nuance:** a message that's genuinely part of a real back-and-forth conversation always syncs regardless of these settings — filters only catch automated, one-way mail (marketing blasts, OTP codes, etc.), never a real reply thread.

**Example:** enabling **Marketing** and **OTP codes** keeps promotional newsletters and one-time-passcode emails out of your unified inbox entirely, while a real human emailing you about billing still comes through even with **Billing** enabled, as long as it reads as a genuine conversation rather than an automated notice.

---

## Keep newsletters

**What it is:** normally mailing-list and marketing mail is dropped before it reaches the app. Turn this on to keep it, in an Inbox **Newsletters** group where you can [unsubscribe](/help/02-inbox#unsubscribe) or [clean it up](/help/02-inbox#clean-up-newsletters).

**Where:** in the account's **Sync filters**. Off by default.

**What happens:** it applies to mail that arrives from now on. The AI never replies to this mail, and [Ask your inbox](/help/12-ask-your-inbox) doesn't search it.

---

## Writing style

**What it is:** AI replies and rewrites for this account are written the way you write: your greeting, sign-off, length, formality and phrases you reuse. It's learned from your own sent mail, never from AI-written or automatic replies. An [agent persona](#ai-agents-personas), when a rule uses one, writes in its own voice instead.

**Where:** the **Writing style** button on the account card. Any member can see it; only the owner can change it.

**How to use it (owner):**
- **Build from sent mail** or **Rebuild from sent mail** learns it now. It needs at least 5 sent emails and uses up to the latest 50.
- **Edit** changes it by hand. Write `{name}` in the greeting for the recipient's name.
- **Use my writing style** turns it on or off.

**Example:**

> Greeting: Hello {name},
> Sign-off: Best regards,
> Formality: neutral
> Length: medium (about 83 words)
> Phrases: "Thank you for reaching out", "Please let me know if you have any questions"

**What happens:**
- **Privacy:** names, email addresses, links and numbers are left out of the profile. Read it after building and edit out anything you'd rather not keep.
- **Updates:** it's rebuilt weekly, unless you edited it or turned it off. A manual rebuild replaces your edits.
- **Is it working?** The panel shows how much AI drafts were changed before sending, in the 30 days before the profile existed and since.
- **Disconnecting the account** deletes the profile.

---

## Policy

**What it is:** a safety net. It's a list of words and phrases that must never go out in an **automatic** reply. If an AI reply contains one, it isn't sent; it waits as a draft for a person to check. The list starts empty, because every business is different. It doesn't affect emails you send yourself.

**How to use it:**
1. Click **Policy (N)** on the account card.
2. Type comma-separated phrases into the box, e.g. `refund, guarantee, discount`.
3. Click **Save**.
4. To clear all phrases, select all the text in the box and delete it, then click **Save** again with an empty box.

**Example:** setting the policy to `refund, cancel my subscription, legal` means any AI-drafted reply that mentions a refund, a cancellation, or anything legal-sounding gets held as a draft instead of auto-sent — so a human reviews anything sensitive before it goes out, even if a [Workflow rule](#workflow-rules) is otherwise set to auto-send.

**What happens:** before any automatic reply is sent, the app looks for each phrase anywhere in the reply. Capital letters don't matter, and a phrase also matches inside a longer word: `refund` also catches *refunds* and *refunded*. If one is found, the reply waits as a draft for a person to check.

> **Tip:** set this up **before** you turn on any automatic replies. Good starting phrases: `refund, discount, price, contract, legal, cancel, guarantee`.

---

## Shared Inbox members

**What it is:** lets more than one person view and reply from the same connected mailbox — useful for a shared `support@` or `sales@` address.

**How to use it:**
1. Click **Members** on the account card.
2. If you're the owner: type your colleague's email address into the **teammate@example.com** box and click **Invite**. They must have **signed up for the app first** with that address; otherwise you'll see *"No user with that email has an account here yet"*. They aren't emailed about it, so let them know yourself.
3. Everyone with access sees the member list: name/email and role (**Owner** or member).
4. The owner can remove a member with a **Remove** button next to their name.

**Example:** inviting `teammate@yourcompany.com` to the `support@yourcompany.com` account lets them see every thread, reply, leave [Notes](/help/02-inbox#notes-internal-team-only), and be an option in the [thread-assignment dropdown](/help/02-inbox#assigning-a-thread-shared-inbox-only) — without giving them your Gmail password.

**What happens:** once two or more people share the mailbox, each email gets a dropdown to [assign](/help/02-inbox#assigning-a-thread-shared-inbox-only) it to someone, and rules can assign or notify a teammate.

**When you remove someone:** they lose access straight away. Emails assigned to them become **Unassigned**, and any AI reply waiting for their approval is cancelled and goes back to Drafts for you to check and send. See [Working as a team](/help/15-working-as-a-team#removing-someone-owner).

---

## CRM Contacts

**What it is:** a lightweight contacts book scoped to this account — track who you're in touch with, their company, status, and any notes, independent of the raw email thread history.

**How to use it:**
1. Click **Contacts** on the account card.
2. **To add:** fill in email (required), name, company, phone, status, tags (comma-separated), and notes, then click **Save/Create**.
3. **To edit:** click into an existing contact's fields, change them, and save.
4. **To delete:** click **Delete** next to a contact.
5. Each contact shows **"last contacted"**, computed from your real message history with that address.

**Example:** a contact `jane@acme.com` — Name: `Jane Doe`, Company: `Acme Corp`, Status: `Active customer`, Tags: `vip, renewal-q3` — gives you an at-a-glance CRM view without leaving the inbox.

**What happens:** contacts are informational — they don't change how mail is filtered or routed by themselves, but future AI features can use this data as additional context when drafting replies to a known contact.

---

## Integrations (Slack, Teams, HubSpot)

**What it is:** connects this account to an external Slack workspace, Microsoft Teams tenant, or HubSpot portal, so a [Workflow rule](#workflow-rules) can post a message or sync a contact there when it matches. Each integration is scoped to this account — connecting Slack for one mailbox doesn't make it available to another.

**How to connect:**
1. Click **Integrations** on the account card.
2. Click **Connect Slack**, **Connect Teams**, or **Connect HubSpot**.
3. You're redirected to that provider's own consent screen — sign in and approve access.
4. You're redirected back here, and the connection now appears in the list with the workspace/tenant/portal's name.
5. To remove a connection, click **Disconnect** next to it. Rules that post to it will fail until you reconnect it or change the rule; the failures show in [Activity](#activity).

**Example:** connecting **Slack** for a `support@yourcompany.com` account lets a Workflow rule post "🚨 New urgent support request" to a `#support` channel the moment a matching email arrives — without anyone needing to check the inbox directly.

**What happens:** connecting does nothing by itself. It's only used when a rule has a **Post to Slack channel**, **Post to Teams channel** or **Sync sender to HubSpot** action (see below), or when you choose Slack for [notifications](/help/06-notifications#choosing-where-notifications-go). The connection is stored securely and stays connected until you disconnect it.

---

## Workflow rules

**Advanced.** Rules are optional. Without any, the app already sorts your email and writes drafts for you to check.

**What it is:** instructions of the form *"when an email like this arrives, do that"*. For example: *when the subject contains "invoice", add the label Invoices and create a task*. A rule can label, file or forward an email, create a task, assign or notify a teammate, and decide how the AI's reply goes out: sent automatically, held for you to check, or signed off by several people first.

> **Always click Test rule before saving.** It shows which recent emails the rule would have matched, without doing anything, so you can see whether it catches the right ones.

**How rules run:** in order, top to bottom, after the AI has sorted the message (its category, priority and so on).

- **Every rule that matches runs its actions**, so you can combine rules — for example "label all invoices" *and* "auto-reply to VIPs".
- A rule with a **Stop (skip lower rules)** action ends the list: rules below it are not checked for that message.
- **How the reply goes out** (Auto-send / Hold as draft / Require multi-step approval) is decided by the **first** matching rule that has one of those actions; reply actions on later rules are ignored. Within that rule, holding always wins: Hold as draft or an approval chain beats Auto-send.
- No rule with a reply action matches → the AI reply is held as a draft for you to review (safe default).
- A message that needs no reply (a "thanks!", or mail you're only Cc'd on) gets no AI reply at all, whatever the rules say — but its other actions (label, notify…) still run.

Every new account starts with one **starter rule**, *"Auto-reply — all messages"*, which is created **switched off**. Turn it on only if you really want every message auto-answered.

**How to create a rule:**
1. Click **Workflows** on the account card, then **+ Add rule**.
2. Give it a **name**.
3. Choose **When all / any of these match** — *all* = every condition must be true (AND), *any* = at least one (OR).
4. Add one or more **conditions**. Each is a field, an operator and a value:

   | Field | What it checks |
   |---|---|
   | Category, Priority, Sentiment, Language | What the AI classified the message as |
   | Sender address, Sender domain | Who sent it (`client@acme.com`, `acme.com`) |
   | To, Cc | Any recipient address on the message |
   | Subject, Message text | The words in the subject or the message itself (quoted earlier mail is ignored) |
   | Contains personal data | The AI found personal data such as account numbers |
   | Has attachments | The message has files attached (inline logos don't count) |
   | First message in thread | It starts a new conversation |
   | Sender is a known contact | A CRM contact, or someone this account has emailed before |
   | Received in business hours | Inside the business hours set under [Automation](#automation-settings) |

   For text, choose how to compare: **is**, **is not**, **contains**, **doesn't contain**, **starts with**, **ends with**, or **is one of** / **is none of** (a list separated by commas). **contains** is the one you'll use most. **matches regex** is for technical users who know regular expressions. Yes/no fields just take **yes** or **no**.
5. A rule with no conditions is refused unless you tick **Match every message** — the form then warns you that the rule runs on every new message.
6. Add one or more **actions** ("Then do this"):
   - **Auto-send the AI reply** — optionally with an [AI Agent persona](#ai-agents-personas), **Calendar-aware replies** (on by default), **Reply all**, and **Auto-send document answers to new senders**.
   - **Hold as draft (no auto-reply)** · **Require multi-step approval** — see [Approval Chains](#approval-chains).
   - **Assign to teammate** · **Notify teammate** · **Post to Slack channel** · **Post to Teams channel** · **Sync sender to HubSpot**.
   - **Forward to address** — forwards the message, with its attachments up to 3 MB, and an optional note on top.
   - **Add label** — a Gmail label, an Outlook category or an IMAP keyword, created if needed.
   - **Move to folder** · **Archive** · **Mark as read** — change the message in your real mailbox.
   - **Snooze thread** — for a number of hours.
   - **Create a task** — a follow-up task for you, with an optional description and due date.
   - **Call a webhook** *(for technical teams)*: sends a short notice about the email, without its text, to another system's web address. A signing secret appears on the rule after saving, so that system can check the notice really came from this app (the `X-Signature` header). Private or internal addresses are refused.
   - **Delay the auto-reply** — waits that many minutes before an auto-reply sends (it can be cancelled meanwhile).
   - **Stop (skip lower rules)**.
7. Click **Test rule** before saving: it shows which of your last 50 sorted emails the rule would match. **Nothing is run** — no labels, no replies, no notifications.
8. Click **Save rule**. A saved rule starts **Enabled**; click the badge to switch it off.

**Testing a saved rule:** the **Test** button on a rule card runs the same check for that rule.

**How to delete a rule:** click **Delete** next to it in the list.

**Example:** a rule named "Invoices" with **any** of `Subject contains invoice` / `Has attachments: yes`, and actions **Add label** `Invoices` + **Create a task**. **Test rule** shows *"Would match 4 of your last 50 classified messages. Nothing was run."* with those messages listed. Because every matching rule runs, a separate "Auto-reply to VIPs" rule further down still answers a VIP's invoice email.

**What happens:** each time a rule matches, what each of its actions did is recorded in the account's [Activity](#activity) log for 90 days.

---

## Automation settings

**What it is:** the limits on replies the AI sends without review, plus your business hours and the signature added to AI replies. One set per account.

**Where to find it:** **Automation** button on the account card (owner only). The button reads **Automation (auto-send off)** when auto-sending is switched off.

| Setting | Default | What it does |
|---|---|---|
| Allow rules to send AI replies without review | on | Off = every reply a rule would auto-send is held as a draft instead |
| At most N per hour / N per day | 10 / 50 | Over a limit, replies are held as drafts and you get one notification |
| Minimum confidence | 70 | The AI's own check must score at least this (0–100) for a reply to auto-send |
| Undo window | 0 seconds | Up to 300: an auto-reply waits this long in Drafts with a **Cancel send** button before it goes out |
| Quiet hours | none | e.g. 22:00 to 07:00 — an auto-reply due in that window waits until it ends. **clear** removes them |
| Business hours | 09:00–17:00, Mon–Fri | What the *Received in business hours* rule condition checks |
| Signature | none, or imported from Gmail | Added to the end of every AI reply; the AI is told not to sign itself. Plain text, and optionally HTML |

Times are in your timezone, set under [Profile](/help/09-settings-profile).

**How to use it:** change the values and click **Save automation settings**; "Saved" appears next to the button.

**Example:** with an undo window of 30 seconds and quiet hours 22:00–07:00, an auto-reply approved at 21:59:50 would be due at 22:00:20 — inside quiet hours — so it waits in Drafts until 07:00, and you can cancel it any time before then.

---

## Activity

**What it is:** what the automation did on this account, newest first, plus how good the AI's drafts have been.

**Where to find it:** **Activity** button on the account card (owner only).

**What you see:**
- **AI draft quality, last 30 days** — for all drafts and per agent: how many people reviewed, how many were sent as is, edited, or discarded, the median time from draft to send, and how many went out without review.
- **The log** — every reply sent without review (to whom, which rule allowed it, the AI's confidence, which documents it drew on, or when a scheduled one will send) and every rule run, with what each action did (done, skipped or failed, and why). **Load older** pages back.

**Example:** *"Rule failed · Invoices · Re: March invoice — ADD_LABEL done · WEBHOOK failed (Webhook responded 500)"* tells you the label was added but your webhook receiver rejected the call.

---

## Calendar-aware replies

**What it is:** when a message is classified as a **Meeting** (scheduling request, calendar invite, rescheduling), the AI checks your connected [calendar's](/help/08-settings-calendars) real availability for the next 7 days before drafting a reply — so the tone reflects reality ("I have some flexibility this week" vs. "my calendar's pretty packed") instead of guessing.

**Important:** this never proposes or commits to a specific date or time on its own — by design, it always says it'll confirm a time shortly rather than naming one, even when your calendar is wide open. If you want the AI to propose an actual time slot, that's a separate, always-human-reviewed flow — see [Suggest a time](/help/04-tasks-and-followups#suggest-a-time-ai-meeting-scheduling) on the Tasks page.

**How to turn it off:** uncheck **Calendar-aware replies** on a rule's **Auto-send the AI reply** action. It's on by default for every rule; unchecking it only affects that one rule.

**What happens:** when it fires, the resulting message shows a small **"Calendar-aware"** badge in the Inbox thread view (next to the "Grounded in your documents" badge, if both applied). No calendar connected, or the lookup fails? The AI just drafts the reply without this context — never blocks or delays the reply.

---

## Approval Chains

**Advanced.** **What it is:** makes an AI reply wait until one or more named people approve it, one after another, before it can be sent. Use it for anything sensitive, such as pricing, refunds or legal questions, where one person's judgement isn't enough.

**How to set it up:**
1. In a Workflow rule's action list, choose **Require multi-step approval**.
2. Click **+ Add approver** and pick an [account member](#shared-inbox-members) — repeat to add more. Order matters: they sign off one at a time, in the order listed.
3. Use the **↑ / ↓** arrows to reorder, or **✕** to remove someone.
4. Save the rule as usual.

**How approving works:** whenever it's your turn, the drafted reply shows up on your **Approvals** page (in the menu on the left) — see [Approvals](/help/11-approvals) for the full walkthrough. Approving your step passes it to the next approver; approving the *final* step sends the reply immediately, with no further action needed. Rejecting stops the chain entirely and returns the draft to Drafts for editing — it is **not** a permanent lock, the draft can still be sent manually once reworked.

**Example:** a rule matching `Category equals Sales` with **Require multi-step approval** set to `[Sales Manager, VP of Sales]` means every AI-drafted sales reply needs both people to sign off, in that order, before it goes out — the VP never even sees it unless the Sales Manager already approved.

**What happens:**
- An approval always wins over **Auto-send the AI reply** on the same rule, so it can never be skipped by accident.
- While it's waiting, nobody can send the draft by hand either. The **Send** button stays switched off, with an explanation.
- **Time limit:** a waiting approval expires after 72 hours unless the rule sets another limit. The current approver gets a reminder halfway. Once it has expired, the draft can be checked and sent by hand.
- **Approvers must be members** of the mailbox. If an approver is removed from the mailbox, any approval waiting on them is cancelled and the draft goes back to Drafts.

---

## AI Agents (personas)

**Advanced.** **What it is:** an agent is a named set of instructions that tells the AI how to reply in a particular role, for example "Customer Support: friendly, step by step, never promise refunds". A rule can then tell the AI to reply as that agent. The agent's instructions **replace** the AI's normal ones completely, so write everything it needs to know.

> **Easiest way to start:** use one of the ready-made agents below and edit it, rather than writing instructions from scratch.

**How to use it:**
1. Click **Agents** on the account card.
2. Click **+ Add agent**.
3. Optionally click a **template** to start from a pre-written prompt: **Personal Assistant**, **Customer Support Agent**, **Sales Agent**, **HR Agent**, **Finance Agent**, **Executive Assistant**.
4. Give it a **name** (e.g. "Support Tier 1").
5. Write the **instructions** (or edit the template's): everything this agent should know about how to reply. Plain sentences work best, for example *"Keep replies under 120 words. Never promise refunds; say the billing team will review it."*
6. Click **Create agent**.
7. To edit later: click **Edit** on an existing persona. To remove: click **Delete**.
8. Each persona has an **Enabled** toggle — disabling it without deleting it stops it from being usable in Workflow rules while keeping its prompt saved.

**Example:** the built-in **Personal Assistant** template starts:
> *"You are a personal assistant replying on behalf of this individual's own inbox — not a business representative. Keep the tone warm and natural... Never invent personal details, plans, or commitments that aren't already in the thread..."*

Creating a second persona, **"Support Tier 1,"** with a prompt focused on troubleshooting steps and escalation language, and attaching it to a Workflow rule that matches `Category equals support`, gives support emails a distinctly different (and more procedural) auto-reply voice than personal correspondence.

**Ready-made agents with rules:** below **+ Add agent**, the list of ready-made agents (Customer Support, Sales, HR, Finance, Executive Assistant) has an **Add** button on each. It creates the agent **and** its suggested workflow rules — for example Finance Agent adds *"Finance mail — draft for review"* and *"Invoices with attachments — label"*. The rules are created **switched off**: review them under **Workflows** before turning them on.

**What happens:** a persona only takes effect when a Workflow rule's action explicitly selects it. Without an attached rule, creating a persona has no effect on live mail — it's just saved for later use. AI replies are also written as you: your name, job title and company from [Profile](/help/09-settings-profile).
