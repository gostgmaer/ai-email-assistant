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

- [ ] Setup Monorepo
- [ ] Setup NestJS API
- [ ] Setup FastAPI (LangGraph Service)
- [ ] Setup Next.js Frontend
- [ ] Configure Docker Compose
- [ ] Configure PostgreSQL
- [ ] Configure Prisma
- [ ] Configure Redis
- [ ] Configure BullMQ
- [ ] Environment Configuration
- [ ] Structured Logging
- [ ] Global Exception Handling
- [ ] Health Check Endpoint

## Authentication

- [ ] JWT Authentication
- [ ] Google OAuth
- [ ] Microsoft OAuth
- [ ] Automatic User Creation
- [ ] Secure OAuth Token Storage
- [ ] Refresh Token Flow

## Database

- [ ] User Model
- [ ] EmailAccount Model
- [ ] Initial Prisma Migrations

### ✅ Deliverable

- User can sign in with Google or Microsoft
- User account is created automatically
- Primary email account is connected automatically
- JWT authentication is working

---

# 📅 Day 2 — Email Providers & Unified Inbox

> **Goal:** Connect providers and display emails.

## Gmail

- [ ] Fetch Inbox
- [ ] Read Email
- [ ] Send Email
- [ ] Thread Support

## Outlook

- [ ] Fetch Inbox
- [ ] Read Email
- [ ] Send Email
- [ ] Thread Support

## IMAP / SMTP

- [ ] Connect Custom Mailbox
- [ ] Fetch Inbox
- [ ] Read Email
- [ ] Send Email

## Email Module

- [ ] Provider Abstraction
- [ ] Unified Inbox
- [ ] Email Detail
- [ ] Thread View
- [ ] Search
- [ ] Pagination

### ✅ Deliverable

- Gmail works
- Outlook works
- IMAP/SMTP works
- Unified inbox is functional

---

# 📅 Day 3 — AI Assistant

> **Goal:** AI-powered email experience.

## LangGraph

- [ ] Graph Setup
- [ ] Email State
- [ ] AI Workflow

## AI Features

- [ ] Email Summary
- [ ] Email Classification
- [ ] Reply Generation
- [ ] Rewrite Reply
- [ ] Improve Grammar
- [ ] Change Tone
- [ ] Human Approval Before Sending

## API

- [ ] AI Endpoints
- [ ] Streaming Responses (Optional)

### ✅ Deliverable

- AI summarizes emails
- AI classifies emails
- AI drafts replies
- AI rewrites replies

---

# 📅 Day 4 — Background Workers & Synchronization

> **Goal:** Keep inbox synchronized automatically.

## BullMQ

- [ ] Queue Setup
- [ ] Worker Setup

## Synchronization

- [ ] Initial Sync
- [ ] Incremental Sync
- [ ] Scheduled Polling
- [ ] Retry Failed Jobs
- [ ] Sync Status

## Database

- [ ] Email Storage
- [ ] Thread Storage
- [ ] Sync State Tracking

### ✅ Deliverable

- Background synchronization works
- Emails stay updated automatically

---

# 📅 Day 5 — Frontend, Testing & Deployment

> **Goal:** Ship the MVP.

## Frontend

- [ ] Login
- [ ] Inbox
- [ ] Email Detail
- [ ] Thread View
- [ ] Compose
- [ ] Reply
- [ ] AI Assistant Panel
- [ ] Settings

## Backend

- [ ] Validation
- [ ] Error Handling
- [ ] Cleanup
- [ ] API Documentation

## Testing

- [ ] Gmail Flow
- [ ] Outlook Flow
- [ ] IMAP Flow
- [ ] AI Flow
- [ ] Sync Flow
- [ ] Send Email Flow

## Deployment

- [ ] Docker Compose
- [ ] Production Environment Variables
- [ ] Production Build
- [ ] Deploy
- [ ] Documentation

### ✅ Deliverable

A fully working AI Email Assistant MVP that users can log into with Google or Microsoft and use immediately.

---

# 🚀 Day 6 (Post-MVP) — Custom Authentication *(Planning Only)*

> **This is NOT part of the MVP.**
>
> This phase starts **only after the 5-day MVP is completed.**

## Custom Authentication

- [ ] Email & Password Registration
- [ ] Login
- [ ] Email Verification
- [ ] Forgot Password
- [ ] Reset Password
- [ ] Change Password
- [ ] Session Management
- [ ] Device Management

## IMAP-only Users

- [ ] Register without Google/Microsoft
- [ ] Connect IMAP/SMTP after login

## Account Management

- [ ] Profile Page
- [ ] Change Email
- [ ] Delete Account
- [ ] Security Settings

### ✅ Deliverable

Users can create a standalone AI Email Assistant account without relying on Google or Microsoft OAuth.

---

# 🏁 MVP Checklist

## Authentication

- [ ] Google OAuth
- [ ] Microsoft OAuth
- [ ] JWT
- [ ] Automatic User Creation

## Email Providers

- [ ] Gmail
- [ ] Outlook
- [ ] IMAP
- [ ] SMTP

## Inbox

- [ ] Unified Inbox
- [ ] Thread View
- [ ] Search
- [ ] Pagination
- [ ] Compose
- [ ] Reply
- [ ] Send

## AI

- [ ] Summarize
- [ ] Classify
- [ ] Draft Reply
- [ ] Rewrite Reply
- [ ] Human Approval

## Background Jobs

- [ ] BullMQ
- [ ] Initial Sync
- [ ] Incremental Sync
- [ ] Retry
- [ ] Scheduled Polling

## Infrastructure

- [ ] Docker
- [ ] PostgreSQL
- [ ] Redis
- [ ] NestJS
- [ ] FastAPI + LangGraph
- [ ] Next.js

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
- RAG
- Attachment Understanding
- PDF/DOCX/OCR
- AI Context Retrieval

## v1.2
- Multiple Connected Accounts
- Google Calendar
- Outlook Calendar
- Follow-ups
- Smart Reminders
- AI Task Extraction

## v2.0
- Multi-tenancy
- Shared Inbox
- Team Collaboration
- Workflow Builder
- AI Agents
- Enterprise Features