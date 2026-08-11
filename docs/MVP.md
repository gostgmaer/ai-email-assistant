# AI Email Assistant Roadmap

## 🎯 Goal

Ship a production-ready MVP in **5 days** that allows users to sign in with their email provider, manage emails from a unified inbox, and use AI to summarize and draft replies.

> **Authentication Philosophy**
>
> - Gmail users sign in with **Google OAuth**
> - Outlook users sign in with **Microsoft OAuth**
> - No traditional registration
> - No passwords
> - No email verification
> - User account is automatically created during OAuth
> - Additional IMAP/SMTP accounts can be connected after login

---

# 📅 Day 1 — Foundation & Authentication

> **Goal:** Project infrastructure and OAuth authentication.

## Infrastructure

- [x] Setup Monorepo
- [x] Setup NestJS API
- [x] Setup FastAPI (LangGraph Service)
- [x] Setup Next.js Frontend
- [x] Configure Docker Compose
- [x] Configure PostgreSQL
- [x] Configure Prisma
- [x] Configure Redis
- [x] Configure BullMQ
- [x] Environment Configuration
- [x] Structured Logging
- [x] Global Exception Handling
- [x] Health Check Endpoint

## Authentication

- [x] JWT Authentication
- [x] Google OAuth
- [x] Microsoft OAuth
- [x] Automatic User Creation
- [x] Secure OAuth Token Storage
- [x] Refresh Token Flow

## Database

- [x] User Model
- [x] EmailAccount Model
- [x] Initial Prisma Migrations

### ✅ Deliverable

- User can sign in with Google or Microsoft
- User account is created automatically
- Primary email account is connected automatically
- JWT authentication is working

---

# 📅 Day 2 — Email Providers & Unified Inbox

> **Goal:** Connect providers and display emails.

## Gmail

- [x] Fetch Inbox
- [x] Read Email
- [x] Send Email
- [x] Thread Support

## Outlook

- [x] Fetch Inbox
- [x] Read Email
- [x] Send Email
- [x] Thread Support

## IMAP / SMTP

- [x] Connect Custom Mailbox
- [x] Fetch Inbox
- [x] Read Email
- [x] Send Email

## Email Module

- [x] Provider Abstraction
- [x] Unified Inbox
- [x] Email Detail
- [x] Thread View
- [x] Search
- [x] Pagination

### ✅ Deliverable

- Gmail works
- Outlook works
- IMAP/SMTP works
- Unified inbox is functional

---

# 📅 Day 3 — AI Assistant

> **Goal:** AI-powered email experience.

## LangGraph

- [x] Graph Setup
- [x] Email State
- [x] AI Workflow

## AI Features

- [x] Email Summary
- [x] Email Classification
- [x] Reply Generation
- [x] Rewrite Reply
- [x] Improve Grammar (via /ai/rewrite's instruction param)
- [x] Change Tone (via /ai/rewrite's instruction param)
- [x] Human Approval Before Sending

## API

- [x] AI Endpoints
- [ ] Streaming Responses (Optional, not built)

### ✅ Deliverable

- AI summarizes emails
- AI classifies emails
- AI drafts replies
- AI rewrites replies

---

# 📅 Day 4 — Background Workers & Synchronization

> **Goal:** Keep inbox synchronized automatically.

## BullMQ

- [x] Queue Setup
- [x] Worker Setup

## Synchronization

- [x] Initial Sync
- [x] Incremental Sync
- [x] Scheduled Polling
- [x] Retry Failed Jobs
- [x] Sync Status

## Database

- [x] Email Storage
- [x] Thread Storage
- [x] Sync State Tracking

### ✅ Deliverable

- Background synchronization works
- Emails stay updated automatically

---

# 📅 Day 5 — Frontend, Testing & Deployment

> **Goal:** Ship the MVP.

## Frontend

- [x] Login
- [x] Inbox
- [x] Email Detail
- [x] Thread View
- [x] Compose
- [x] Reply
- [x] AI Assistant Panel
- [x] Settings

## Backend

- [x] Validation
- [x] Error Handling
- [x] Cleanup
- [x] API Documentation (Swagger)

## Testing

- [x] Gmail Flow (gmail.client.spec.ts + live-verified)
- [ ] Outlook Flow (client implemented; no dedicated automated test yet)
- [ ] IMAP Flow (client implemented; no dedicated automated test yet)
- [x] AI Flow (live-verified: classify/summarize/reply/rewrite/extract/auto-schedule)
- [x] Sync Flow (email-sync.service.spec.ts + live-verified)
- [x] Send Email Flow (compose.service.spec.ts + live-verified)

## Deployment

- [x] Docker Compose
- [x] Production Environment Variables (local .env; not cloud-managed secrets)
- [x] Production Build (NODE_ENV=production images)
- [x] Deploy (CI workflow + self-hosted VM runbook, Docker Compose + Caddy — see docs/deployment.md; actual server/DNS provisioning still needs your VM)
- [x] Documentation (docs/deployment.md runbook, alongside this file + Swagger)

### ✅ Deliverable

A fully working AI Email Assistant MVP that users can log into with Google or Microsoft and use immediately.

---

# 🚀 Day 6 (Post-MVP) — Custom Authentication *(Planning Only)*

> **This is NOT part of the MVP.**
>
> This phase starts **only after the 5-day MVP is completed.**

## Custom Authentication

- [x] Email & Password Registration
- [x] Login
- [x] Email Verification
- [x] Forgot Password
- [x] Reset Password
- [x] Change Password
- [x] Session Management
- [x] Device Management

## IMAP-only Users

- [x] Register without Google/Microsoft
- [x] Connect IMAP/SMTP after login

## Account Management

- [x] Profile Page
- [x] Change Email
- [x] Delete Account
- [x] Security Settings

### ✅ Deliverable

Users can create a standalone AI Email Assistant account without relying on Google or Microsoft OAuth. **Done and live-verified** (register/login tested end-to-end against the running API on 2026-08-08) — despite the "Planning Only" heading above, this phase has already shipped.

---

# 🏁 MVP Checklist

## Authentication

- [x] Google OAuth
- [x] Microsoft OAuth
- [x] JWT
- [x] Automatic User Creation

## Email Providers

- [x] Gmail
- [x] Outlook
- [x] IMAP
- [x] SMTP

## Inbox

- [x] Unified Inbox
- [x] Thread View
- [x] Search
- [x] Pagination
- [x] Compose
- [x] Reply
- [x] Send

## AI

- [x] Summarize
- [x] Classify
- [x] Draft Reply
- [x] Rewrite Reply
- [x] Human Approval

## Background Jobs

- [x] BullMQ
- [x] Initial Sync
- [x] Incremental Sync
- [x] Retry
- [x] Scheduled Polling

## Infrastructure

- [x] Docker
- [x] PostgreSQL
- [x] Redis
- [x] NestJS
- [x] FastAPI + LangGraph
- [x] Next.js

---

# 🎯 MVP Success Criteria

A user should be able to:

1. Sign in with Google (Gmail) or Microsoft (Outlook).
2. Automatically connect their primary email account during sign-in.
3. Optionally connect an additional IMAP/SMTP mailbox.
4. View a unified inbox.
5. Read email threads.
6. Generate AI summaries.
7. Generate and rewrite AI replies.
8. Approve and send emails.
9. Receive new emails through background synchronization.

---

# 📌 After MVP


## v1.1
- [x] RAG
- [x] Attachment Understanding
- [x] PDF/DOCX
- [ ] OCR (scanned/image-based documents — not implemented)
- [x] AI Context Retrieval

## v1.2
- [x] Multiple Connected Accounts
- [x] Google Calendar (freebusy + event creation)
- [x] Outlook Calendar (freebusy + event creation)
- [x] Follow-ups
- [x] Smart Reminders (snooze + daily digest)
- [x] AI Task Extraction
- [x] Meeting scheduling: AI-suggested time → human-approved → calendar event + in-thread confirmation reply (via AI `generateReply()`)
- [x] Opt-in full automation toggle (`EmailAccount.autoScheduleMeetings`, off by default)

## v2.0
- [x] Client Deployment (CI + self-hosted VM runbook, Docker Compose + Caddy; provisioning itself still needs your VM/DNS)
- [x] Shared Inbox (account-level sharing, assign, internal notes)
- [x] Team Collaboration (covered by Shared Inbox's membership model)
- [x] Workflow Builder (rules engine, replaced the old hardcoded auto-send logic)
- [x] AI Agents (persona system built and wired in, plus 5 pre-built templates)
  - [x] Customer Support Agent (template)
  - [x] Sales Agent (template)
  - [x] HR Agent (template)
  - [x] Finance Agent (template)
  - [x] Executive Assistant (template)
- [x] Meeting confirmation replies actually include the real calendar event link (`sendUpdates` + deterministic link-append; previously the invite silently never reached the attendee)
- [x] Every newly-connected account is seeded with a starter Agent + a disabled catch-all auto-reply WorkflowRule, so auto-reply is one toggle away instead of an empty, undiscoverable Settings page

## v3.0
- [ ] Multi-tenancy
- [ ] Enterprise Features (RBAC, Audit Logs, SSO, SCIM, API Keys, Webhooks, Compliance, Security Controls — depends on multi-tenancy existing first)
- [x] Integrations phase 1 (Slack, Teams, HubSpot) — moved from v2.0; phase 2 (Jira, Notion, Linear, Salesforce, Discord) not started
  - [x] Slack — OAuth connect (per-account, mirrors Google/Microsoft connect flow), channel picker, and a `POST_TO_SLACK` Workflow rule action (e.g. "notify #support when a thread is assigned"). Built end-to-end first as the template for Teams/HubSpot, per docs/v2.0-plan.md §5.
  - [x] Microsoft Teams — OAuth via the same Azure AD app registration as Microsoft mail/calendar (Graph scopes: Team/Channel.ReadBasic.All, ChannelMessage.Send, offline_access, real refresh-token handling since Graph tokens expire ~1hr). Two-level team → channel picker (`GET /integrations/:id/teams-channels`) and a `POST_TO_TEAMS` Workflow rule action.
  - [x] HubSpot — OAuth (refreshable, ~30min token expiry) and a `CREATE_HUBSPOT_CONTACT` Workflow rule action that upserts the matched message's sender as a HubSpot contact via the CRM v3 batch-upsert endpoint (keyed on email).
  - [ ] Jira (phase 2)
  - [ ] Notion (phase 2)
  - [ ] Linear (phase 2)
  - [ ] Salesforce (phase 2)
  - [ ] Discord (phase 2)
- [ ] Analytics (Response Time, Inbox Health, Productivity Metrics, AI Usage, Team Performance, SLA Tracking — moved from v2.0, none started)
- [x] True multi-step Approval Chains — new `REQUIRE_APPROVAL_CHAIN` Workflow rule action (always wins over AUTO_REPLY on the same rule); `ApprovalChain`/`ApprovalStep` models gate a drafted reply behind ordered sign-off. Approving the final step sends the draft automatically; rejecting hands control back to a human (draft stays in Drafts, sendable manually — not a permanent lock). `ComposeService.sendDraft` blocks manual sending only while a chain is still PENDING. New `/approvals` page ("my pending approvals" queue) plus an inline chain-status banner on the compose/draft page.
  - [x] Multiple sequential approval stages per WorkflowRule (not just single auto-send-vs-draft)
  - [x] Per-step approver assignment (ordered `approverUserIds`, picked in the Workflow rule builder)
  - [x] Step progression logic (advance on approval — WAITING → PENDING for the next step; halt on rejection)
  - [x] Chain status visibility (who approved, who's pending, at which step — `/approvals` and the compose page banner)