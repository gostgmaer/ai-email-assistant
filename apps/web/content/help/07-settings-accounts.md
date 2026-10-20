← [Back to index](/help)

# Settings → Accounts

This is the control center for every connected mailbox. Each connected account is its own card with its own toolbar of buttons — everything below (sync filters, Policy, Members, Contacts, Workflow rules, AI Agents) is configured **per account**, not globally.

For how to connect an account in the first place, see [Getting started](/help/01-getting-started).

## Where to find it

**Settings → Accounts** in the left sidebar (`/settings/email-accounts`).

## The account card toolbar

Each connected account shows a row of buttons. Some are always visible; some only show for the account **owner** (the person who connected it):

| Button | Who sees it | What it does |
|---|---|---|
| Sync now | everyone | Triggers an immediate sync instead of waiting for the next scheduled one |
| Pause sync / Resume sync | everyone | Temporarily stops pulling new mail into the app (mail still exists in the real mailbox, just not reflected here) |
| Members | everyone | Opens the [Shared Inbox members](#shared-inbox-members) panel |
| Contacts | everyone | Opens the [CRM contacts](#crm-contacts) panel |
| Workflows | owner only | Opens [Workflow rules](#workflow-rules) |
| Agents | owner only | Opens [AI Agents (personas)](#ai-agents-personas) |
| Integrations | owner only | Opens [Integrations](#integrations-slack-teams-hubspot) — connect Slack, Teams, or HubSpot for this account |
| Sync filters (N) | owner only | Opens [Sync filters](#sync-filters) — N = how many are currently active |
| Policy (N) | owner only | Opens [Policy](#policy) — N = how many prohibited phrases are set |
| Auto-schedule meetings (on/off) | owner only | Toggles automatic calendar scheduling — see [Tasks → Suggest a time](/help/04-tasks-and-followups#suggest-a-time-ai-meeting-scheduling) |
| Make primary | owner only | Marks this as your default "From" account in Compose |
| Disconnect | owner only | Removes the account entirely (with a confirmation prompt) |

---

## Sync filters

**What it is:** lets you exclude entire categories of automated mail from ever reaching your inbox or the AI pipeline — so promotional blasts, OTP codes, etc. don't clutter your inbox or waste AI processing.

**How to use it:**
1. Click **Sync filters (N)** on the account card.
2. You'll see six toggle pills: **Marketing**, **OTP codes**, **Password reset**, **Billing**, **Shipping**, **Calendar invites**.
3. Click a pill to highlight it (active/indigo) — highlighted categories are **excluded from sync entirely**: they never appear in your inbox and never reach the AI.
4. Click an already-active pill to turn it back on (let that category sync normally).

**Important nuance:** a message that's genuinely part of a real back-and-forth conversation always syncs regardless of these settings — filters only catch automated, one-way mail (marketing blasts, OTP codes, etc.), never a real reply thread.

**Example:** enabling **Marketing** and **OTP codes** keeps promotional newsletters and one-time-passcode emails out of your unified inbox entirely, while a real human emailing you about billing still comes through even with **Billing** enabled, as long as it reads as a genuine conversation rather than an automated notice.

---

## Policy

**What it is:** a hard safety rail — a list of phrases that, if present in an AI-drafted reply, block it from auto-sending and hold it as a draft for human review instead. Empty by default; nothing is pre-populated, because every account's policy is different.

**How to use it:**
1. Click **Policy (N)** on the account card.
2. Type comma-separated phrases into the box, e.g. `refund, guarantee, discount`.
3. Click **Save**.
4. To clear all phrases, select all the text in the box and delete it, then click **Save** again with an empty box.

**Example:** setting the policy to `refund, cancel my subscription, legal` means any AI-drafted reply that mentions a refund, a cancellation, or anything legal-sounding gets held as a draft instead of auto-sent — so a human reviews anything sensitive before it goes out, even if a [Workflow rule](#workflow-rules) is otherwise set to auto-send.

**What happens:** the check is case-insensitive substring matching against the drafted reply text, evaluated every time before an auto-send decision is made.

---

## Shared Inbox members

**What it is:** lets more than one person view and reply from the same connected mailbox — useful for a shared `support@` or `sales@` address.

**How to use it:**
1. Click **Members** on the account card.
2. If you're the owner: type an existing user's sign-up email into the **"teammate@example.com"** box and click **Invite** — the app finds the matching existing user and grants them access. (You can't invite someone who hasn't signed up yet.)
3. Everyone with access sees the member list: name/email and role (**Owner** or member).
4. The owner can remove a member with a **Remove** button next to their name.

**Example:** inviting `teammate@yourcompany.com` to the `support@yourcompany.com` account lets them see every thread, reply, leave [Notes](/help/02-inbox#notes-internal-team-only), and be an option in the [thread-assignment dropdown](/help/02-inbox#assigning-a-thread-shared-inbox-only) — without giving them your Gmail password.

**What happens:** once there are 2+ members, threads on this account gain an **assignee** dropdown in the Inbox thread view, and this account becomes selectable as an "Assign to teammate" target in [Workflow rules](#workflow-rules).

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
5. To remove a connection, click **Disconnect** next to it — any Workflow rule action that referenced it will simply fail silently (best-effort) until you reconnect or edit the rule.

**Example:** connecting **Slack** for a `support@yourcompany.com` account lets a Workflow rule post "🚨 New urgent support request" to a `#support` channel the moment a matching email arrives — without anyone needing to check the inbox directly.

**What happens:** the connection itself does nothing on its own — it only becomes active once referenced by a Workflow rule action (**Post to Slack channel**, **Post to Teams channel**, or **Sync sender to HubSpot**, see below). Access tokens are stored encrypted; Teams and HubSpot tokens are refreshed automatically as they expire, Slack's do not expire.

---

## Workflow rules

**What it is:** the actual automation engine — the rules that decide, for every new message on this account, whether the AI auto-sends a reply, holds it for review, assigns it to a teammate, posts to a chat app, syncs a CRM contact, or requires multi-person sign-off before sending.

**How rules run:** in order, top to bottom, after AI classification of the message. **The first rule whose conditions all match wins** — only its actions run. If no rule matches, the AI reply is held as a draft for you to review (safe default).

Every new account starts with one starter rule: *"Auto-reply — all messages"* → matches everything, action = auto-send using the default reply prompt.

**How to create a rule:**
1. Click **Workflows** on the account card.
2. Click **+ Add rule**.
3. Give it a **name**.
4. Add one or more **conditions** ("When all of these match"):
   - Field: **Category**, **Priority**, or **Sender address**.
   - Operator: **equals** or **contains**.
   - Value: free text, e.g. `billing`, `urgent`, or `@bigclient.com`.
   - Click **+ Add condition** for more (all conditions must match — it's an AND, not an OR).
5. Add an **action** ("Then do this"):
   - **Auto-send the AI reply** — optionally pick a specific [AI Agent persona](#ai-agents-personas) to use instead of the default prompt. Has its own **Calendar-aware replies** checkbox (on by default) — see [Calendar-aware replies](#calendar-aware-replies) below.
   - **Assign to teammate** — requires 2+ [Members](#shared-inbox-members).
   - **Notify teammate** — sends an in-app [notification](/help/06-notifications) without touching the reply.
   - **Post to Slack channel** — requires a connected [Slack integration](#integrations-slack-teams-hubspot); pick the workspace, then the channel.
   - **Post to Teams channel** — requires a connected [Teams integration](#integrations-slack-teams-hubspot); pick the tenant, then the team, then the channel.
   - **Sync sender to HubSpot** — requires a connected [HubSpot integration](#integrations-slack-teams-hubspot); creates or updates a HubSpot contact for whoever sent the matching message (email, and name if available) — no picker needed beyond selecting which portal.
   - **Hold as draft (no auto-reply)** — always draft, never auto-send, regardless of confidence.
   - **Require multi-step approval** — see [True multi-step Approval Chains](#true-multi-step-approval-chains) below.
   - Click **+ Add action** for more than one action per rule.
6. Click **Save rule**.

**How to delete a rule:** click **Delete** next to it in the list.

**Example:** a rule named "Escalate VIP billing" with condition `Sender address contains @bigclient.com` and action `Assign to teammate` + `Notify teammate` ensures anything from that domain skips auto-reply entirely and gets a human's attention immediately — as long as it's placed *above* the catch-all starter rule (since the first match wins).

**What happens:** every incoming message is evaluated against your rule list top-to-bottom; whichever rule matches first determines the action. Reordering matters — put more specific rules above general ones.

---

## Calendar-aware replies

**What it is:** when a message is classified as a **Meeting** (scheduling request, calendar invite, rescheduling), the AI checks your connected [calendar's](/help/08-settings-calendars) real availability for the next 7 days before drafting a reply — so the tone reflects reality ("I have some flexibility this week" vs. "my calendar's pretty packed") instead of guessing.

**Important:** this never proposes or commits to a specific date or time on its own — by design, it always says it'll confirm a time shortly rather than naming one, even when your calendar is wide open. If you want the AI to propose an actual time slot, that's a separate, always-human-reviewed flow — see [Suggest a time](/help/04-tasks-and-followups#suggest-a-time-ai-meeting-scheduling) on the Tasks page.

**How to turn it off:** uncheck **Calendar-aware replies** on a rule's **Auto-send the AI reply** action. It's on by default for every rule; unchecking it only affects that one rule.

**What happens:** when it fires, the resulting message shows a small **"Calendar-aware"** badge in the Inbox thread view (next to the "Grounded in your documents" badge, if both applied). No calendar connected, or the lookup fails? The AI just drafts the reply without this context — never blocks or delays the reply.

---

## True multi-step Approval Chains

**What it is:** gates a drafted reply behind sign-off from one or more specific people, in order, before it's allowed to send — for anything sensitive enough that one person's judgment (or the AI's own confidence score) isn't enough on its own.

**How to set it up:**
1. In a Workflow rule's action list, choose **Require multi-step approval**.
2. Click **+ Add approver** and pick an [account member](#shared-inbox-members) — repeat to add more. Order matters: they sign off one at a time, in the order listed.
3. Use the **↑ / ↓** arrows to reorder, or **✕** to remove someone.
4. Save the rule as usual.

**How approving works:** whenever it's your turn, the drafted reply shows up on your **Approvals** page (left sidebar) — see [Approvals](/help/11-approvals) for the full walkthrough. Approving your step passes it to the next approver; approving the *final* step sends the reply immediately, with no further action needed. Rejecting stops the chain entirely and returns the draft to Drafts for editing — it is **not** a permanent lock, the draft can still be sent manually once reworked.

**Example:** a rule matching `Category equals Sales` with **Require multi-step approval** set to `[Sales Manager, VP of Sales]` means every AI-drafted sales reply needs both people to sign off, in that order, before it goes out — the VP never even sees it unless the Sales Manager already approved.

**What happens:** this always wins over **Auto-send the AI reply** if both are somehow on the same rule — a chain can never be silently skipped. While a chain is pending, the draft cannot be sent manually from the Compose/Drafts screen either; the **Send** button stays disabled with an explanation until every step approves.

---

## AI Agents (personas)

**What it is:** named, reusable system prompts — a persona's prompt **fully replaces** the default reply prompt when used (not appended to it). Attach one to a Workflow rule's "Auto-send the AI reply" action to give that rule a distinct voice/behavior.

**How to use it:**
1. Click **Agents** on the account card.
2. Click **+ Add agent**.
3. Optionally click a **template** to start from a pre-written prompt: **Personal Assistant**, **Customer Support Agent**, **Sales Agent**, **HR Agent**, **Finance Agent**, **Executive Assistant**.
4. Give it a **name** (e.g. "Support Tier 1").
5. Write (or edit the template's) **system prompt** — the complete instructions for how this persona should reply.
6. Click **Create agent**.
7. To edit later: click **Edit** on an existing persona. To remove: click **Delete**.
8. Each persona has an **Enabled** toggle — disabling it without deleting it stops it from being usable in Workflow rules while keeping its prompt saved.

**Example:** the built-in **Personal Assistant** template starts:
> *"You are a personal assistant replying on behalf of this individual's own inbox — not a business representative. Keep the tone warm and natural... Never invent personal details, plans, or commitments that aren't already in the thread..."*

Creating a second persona, **"Support Tier 1,"** with a prompt focused on troubleshooting steps and escalation language, and attaching it to a Workflow rule that matches `Category equals support`, gives support emails a distinctly different (and more procedural) auto-reply voice than personal correspondence.

**What happens:** a persona only takes effect when a Workflow rule's action explicitly selects it. Without an attached rule, creating a persona has no effect on live mail — it's just saved for later use.
