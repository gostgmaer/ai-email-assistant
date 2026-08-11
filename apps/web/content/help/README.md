# AI Email Assistant — Help & Usability Guide

This is a plain-language guide to every feature and setting in the app: what it's for, exactly where to find it, what to click, and what happens as a result. Each page uses the same format:

- **What it is** — the feature in one or two sentences.
- **Where to find it** — the exact navigation path.
- **How to use it** — numbered click-by-click steps.
- **Example** — a concrete worked example with sample input/output.
- **What happens** — the real effect (what gets saved, sent, or changed, and where).

> Screenshots are not included in this pass — text and examples only. Images can be added later as a separate pass.

## Contents

1. [Getting started — connecting an inbox](/help/01-getting-started)
2. [Inbox](/help/02-inbox) — reading mail, AI replies, notes, snooze, summarize
3. [Compose](/help/03-compose) — writing new mail, drafts, AI rewrite
4. [Tasks & Follow-ups](/help/04-tasks-and-followups) — auto-extracted action items, meeting scheduling
5. [Documents](/help/05-documents) — upload, search, RAG grounding
6. [Notifications](/help/06-notifications)
7. [Settings → Accounts](/help/07-settings-accounts) — the biggest page: sync filters, Policy, auto-schedule meetings, Shared Inbox members, CRM contacts, Integrations (Slack/Teams/HubSpot), Workflow rules, Calendar-aware replies, True multi-step Approval Chains, AI Agents (personas)
8. [Settings → Calendars](/help/08-settings-calendars)
9. [Settings → Profile](/help/09-settings-profile)
10. [Settings → Security](/help/10-settings-security)
11. [Approvals](/help/11-approvals) — your queue of drafts waiting on your sign-off

## The mental model in one paragraph

You connect one or more mailboxes (Gmail, Outlook, or any IMAP account) under **Settings → Accounts**. Every account has its own **Sync filters** (what gets ignored), **Policy** (phrases that block an auto-send), **Workflow rules** (what the AI should do with each incoming message), optional **Integrations** (Slack, Teams, HubSpot — for a rule to post to or sync with), and optionally its own **AI Agent personas** (named system prompts a rule can use instead of the default). Incoming mail is classified, matched against your rules, and either auto-replied (optionally calendar-aware for scheduling requests), held as a draft, routed through a multi-person **Approval Chain**, assigned to a teammate, posted to Slack/Teams, synced to HubSpot, or just left alone — depending on what you've configured. Everything the AI does (auto-sends, extracted tasks, document grounding, approval decisions) is visible and reversible from the **Inbox**, **Tasks**, and **Approvals** pages.
