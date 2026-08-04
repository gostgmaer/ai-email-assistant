# AI Email Assistant Architecture

> **Version:** MVP v1.0
>
> **Status:** Design Document
>
> **Architecture Style:** Modular Monolith + AI Microservice
>
> **Goal:** Build a production-ready AI Email Assistant with a clean architecture that can evolve into an enterprise platform without major refactoring.

---

# High Level Architecture

```text
                         ┌──────────────────────┐
                         │     Next.js App      │
                         │       (Frontend)     │
                         └──────────┬───────────┘
                                    │
                          REST API / WebSocket
                                    │
                    ┌───────────────▼────────────────┐
                    │         NestJS Backend         │
                    │                                │
                    │ Authentication                │
                    │ Email Providers               │
                    │ Email Management              │
                    │ Background Jobs              │
                    │ Business Logic               │
                    └───────────────┬────────────────┘
                                    │
            ┌───────────────────────┼────────────────────────┐
            │                       │                        │
            ▼                       ▼                        ▼
     PostgreSQL                 Redis/BullMQ          FastAPI AI
       (Prisma)                 Background Jobs       LangGraph
            │                                                │
            └──────────────────────┬─────────────────────────┘
                                   │
             ┌─────────────────────┼─────────────────────┐
             ▼                     ▼                     ▼
        Gmail API          Microsoft Graph         IMAP / SMTP
```

---

# Services

## 1. Frontend

Technology

- Next.js
- React
- TypeScript
- Tailwind CSS
- TanStack Query
- Zustand

Responsibilities

- Authentication
- Inbox UI
- Email Threads
- AI Actions
- Settings
- Compose Email

---

## 2. API Service

Technology

- NestJS
- Prisma
- PostgreSQL
- BullMQ
- Passport
- JWT

Responsibilities

- Authentication
- Email Provider Integration
- Business Logic
- User Management
- Background Jobs
- Email Synchronization
- AI Service Communication

---

## 3. AI Service

Technology

- FastAPI
- LangGraph
- LangChain

Responsibilities

- Email Summary
- Classification
- Draft Generation
- Rewrite
- Prompt Orchestration
- Future RAG

---

## 4. PostgreSQL

Responsibilities

- Users
- Email Accounts
- Email Metadata
- Threads
- Sync State
- Drafts

---

## 5. Redis

Responsibilities

- BullMQ
- Cache
- Job Queue
- Session Cache

---

# Why Separate AI Service?

Instead of embedding LangGraph inside NestJS.

Advantages

- Independent scaling
- Independent deployments
- Better Python ecosystem support
- Easier future RAG implementation
- Easier GPU deployment

---

# Deployment (MVP)

```text
Docker Compose

├── frontend
├── api
├── ai
├── postgres
├── redis
└── worker
```

Total Services

- Frontend
- API
- Worker
- AI
- PostgreSQL
- Redis

---

# Backend Structure

```text
apps/api

src/

├── common/
│
├── config/
│
├── database/
│
├── modules/
│   ├── auth/
│   ├── users/
│   ├── email/
│   ├── jobs/
│   ├── ai/
│   ├── settings/
│   └── health/
│
├── providers/
│   ├── gmail/
│   ├── outlook/
│   ├── imap/
│   └── smtp/
│
├── queues/
│
├── prisma/
│
└── main.ts
```

---

# AI Service Structure

```text
apps/ai

app/

├── graph/
├── nodes/
├── state/
├── prompts/
├── tools/
├── services/
├── api/
├── config/
└── main.py
```

---

# Frontend Structure

```text
apps/web

app/

components/

features/

    auth/

    inbox/

    email/

    compose/

    ai/

    settings/

lib/

hooks/

services/
```

---

# Database

## User

```text
id
name
email
avatar
provider
createdAt
```

---

## EmailAccount

```text
id

userId

provider

email

accessToken

refreshToken

expiresAt

syncEnabled

createdAt
```

---

## EmailThread

```text
id

providerThreadId

subject

snippet

lastMessageAt

userId
```

---

## EmailMessage

```text
id

threadId

providerMessageId

from

to

cc

bcc

subject

body

html

receivedAt

isRead
```

---

## SyncState

```text
id

emailAccountId

lastSyncAt

cursor

status
```

---

# Email Providers

Every provider implements the same interface.

```ts
EmailProvider

connect()

disconnect()

sync()

send()

getMessage()

getThread()
```

Implementations

- GmailProvider
- OutlookProvider
- ImapProvider

This keeps the Email module provider-agnostic.

---

# Authentication Flow

## Gmail

```text
User

↓

Google OAuth

↓

NestJS

↓

Create User

↓

Create EmailAccount

↓

JWT

↓

Dashboard
```

---

## Outlook

```text
User

↓

Microsoft OAuth

↓

NestJS

↓

Create User

↓

Create EmailAccount

↓

JWT

↓

Dashboard
```

---

# Email Flow

```text
User

↓

Open Email

↓

API

↓

Database

↓

Provider (if needed)

↓

Return Email
```

---

# AI Flow

```text
User

↓

Click "Summarize"

↓

NestJS API

↓

FastAPI

↓

LangGraph

↓

LLM

↓

Result

↓

Frontend
```

---

# Send Email Flow

```text
Compose

↓

Generate Draft (Optional)

↓

Human Approval

↓

NestJS

↓

Provider

↓

Email Sent
```

---

# Background Sync Flow

```text
Scheduler

↓

BullMQ

↓

Worker

↓

Provider

↓

Sync Latest Emails

↓

Store in Database

↓

Update Inbox
```

---

# Security

- OAuth Authentication
- JWT
- Refresh Tokens
- Encrypted OAuth Tokens at Rest
- Secure HTTP-only Cookies (or secure bearer token strategy)
- Environment-based Secrets
- Input Validation
- CORS
- Helmet
- Rate Limiting (Future)

---

# Future Scaling

## v1.1

- RAG
- Attachments
- Semantic Search

## v1.2

- Multi-account
- Calendar Integration
- AI Productivity

## v2.0

- Multi-tenancy
- Shared Inbox
- AI Agents
- Enterprise Features

---

# Design Principles

- Clean Architecture
- SOLID Principles
- Provider Abstraction
- Domain-driven Modules
- Stateless API
- Background Processing for Long-running Tasks
- AI as an Independent Service
- Production-ready Docker Deployment
- Future-proof for Enterprise Expansion