# Deployment Guide

Target: **Railway** (see [`v2.0-plan.md`](./v2.0-plan.md#1-client-deployment) for why). This doc is the concrete runbook — steps to actually stand up the environment. Provisioning (creating the Railway project, connecting billing) needs your account; the steps below are written so you can run them directly, or hand me the project once it exists to wire up the rest.

## Architecture

6 pieces, all already containerized:

| Service | Image | Needs |
|---|---|---|
| `api` | `apps/api/Dockerfile` | Postgres, Redis, `ai` service URL |
| `worker` | `apps/api/Dockerfile` (same image, `start:worker` command) | Postgres, Redis, `ai` service URL |
| `ai` | `apps/ai/Dockerfile` | An LLM provider API key (Google/OpenAI/Anthropic/Groq — see `LLM_PROVIDER`) |
| `web` | `apps/web/Dockerfile` | `api` service URL |
| Postgres | Railway managed | `vector` extension (pgvector, for the RAG/HNSW index) |
| Redis | Railway managed | Used by BullMQ (`api` + `worker`) |

`api` and `worker` share one image — `apps/api/Dockerfile` builds once, `api` runs `start:prod` (`node dist/main`), `worker` runs `start:worker` (`node dist/main.worker`). Deploy them as two separate Railway services from the same repo/Dockerfile with different start commands, not two builds.

## 1. Create the project and databases

1. New Railway project.
2. Add a **PostgreSQL** plugin.
3. Add a **Redis** plugin.
4. Once Postgres is up, connect to it (Railway's dashboard has a query console, or use the connection string it gives you with `psql`) and run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
   Required before the first `prisma migrate deploy` — the schema's HNSW index depends on it existing.

## 2. Add the four app services

For each, create a service from this GitHub repo, set **Root Directory** to the path below, and Railway will pick up the matching Dockerfile automatically (no `railway.json` needed — Railway auto-detects `Dockerfile` in the root directory you point it at).

| Service name | Root Directory | Start command override |
|---|---|---|
| `api` | `apps/api` | (default — uses Dockerfile `CMD`) |
| `worker` | `apps/api` | `node dist/main.worker` |
| `ai` | `apps/ai` | (default) |
| `web` | `apps/web` | (default) |

## 3. Environment variables

Copy each service's `.env.example` as the starting point, then override the values below to point at Railway's internal networking instead of `localhost`. Railway exposes internal hostnames per service (`<service>.railway.internal`) and injects `${{Postgres.DATABASE_URL}}` / `${{Redis.REDIS_URL}}`-style references you can use directly in the dashboard instead of copy-pasting connection strings.

**`api` and `worker`** (from `apps/api/.env.example`):
- `DATABASE_URL` → Postgres plugin's connection string
- `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` → Redis plugin's values
- `JWT_SECRET`, `ENCRYPTION_KEY` → generate fresh production values (`openssl rand -hex 32` for the encryption key), do **not** reuse local dev values
- `FRONTEND_URL` → the `web` service's public Railway URL
- `GOOGLE_CALLBACK_URL` / `GOOGLE_MAIL_CALLBACK_URL` / `GOOGLE_CALENDAR_CALLBACK_URL` and the Microsoft equivalents → the `api` service's public Railway URL, and **must also be added as authorized redirect URIs in the Google Cloud Console / Azure App Registration** — this is the step most likely to get missed and silently break OAuth in production
- `AI_SERVICE_URL` → the `ai` service's *internal* Railway hostname (no need to expose `ai` publicly at all — only `api` and `web` need public URLs)

**`ai`** (from `apps/ai/.env.example`):
- Whichever `LLM_PROVIDER`'s API key you're using (`GOOGLE_API_KEY` etc.)
- `APP_ENV=production`, `APP_DEBUG=false`

**`web`** (from `apps/web/.env.example`):
- `NEXT_PUBLIC_API_URL` → the `api` service's public Railway URL

## 4. First deploy

After all four services build successfully once:

1. Run migrations against the production database — `pnpm --filter api exec prisma migrate deploy`, either via Railway's one-off run/shell feature on the `api` service, or locally with `DATABASE_URL` pointed at the production Postgres.
2. Hit the `api` service's `/health` endpoint to confirm it's up.
3. Log in via Google or Microsoft OAuth end-to-end once, confirming the redirect URIs configured in step 3 actually work — this is the one thing that can't be verified without a real OAuth round trip.

## 5. CI

`.github/workflows/ci.yml` runs typecheck + `api`'s Jest suite (8 suites, 25 tests) + `ai`'s pytest suite on every PR and push to `master`. It does **not** currently deploy — wire up Railway's GitHub auto-deploy (per-service, in the Railway dashboard) separately once the project exists; that's push-to-deploy without needing anything in this repo.

## Rollback

Railway keeps previous deploys per service — roll back from the dashboard's deployment history. Database migrations are forward-only (per this repo's hand-written-migration convention, see `apps/api/prisma/migrations/`); a schema rollback means writing and applying a new down-migration, not reverting Railway's deploy.

## Known gaps (not blocking, tracked here for later)

- `apps/ai` has 26 pre-existing `ruff` lint findings — not part of this pass, worth a dedicated cleanup before it's part of the CI gate.
- No autoscaling / multi-region / blue-green — single instance per service, matching current usage. Revisit if that changes.
