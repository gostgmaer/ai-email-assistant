# Deployment Guide

Target: **your own VM / dedicated server**, via Docker Compose (see [`v2.0-plan.md`](./v2.0-plan.md#1-client-deployment)). Nothing here needs a PaaS account — everything is already containerized (`docker-compose.prod.yml` at the repo root), so this is: provision a Linux box, install Docker, point DNS at it, run the deploy script.

## Architecture

7 containers, all built from this repo (`docker-compose.prod.yml`):

| Service | Image | Needs |
|---|---|---|
| `caddy` | `caddy:2-alpine` | Public 80/443 — the only container that binds a host port |
| `web` | `apps/web/Dockerfile` | `api`'s internal URL |
| `api` | `apps/api/Dockerfile` | Postgres, Redis, `ai`'s internal URL |
| `worker` | `apps/api/Dockerfile` (same image, `dist/main.worker.js` command) | Postgres, Redis, `ai`'s internal URL |
| `ai` | `apps/ai/Dockerfile` | An LLM provider API key (Google/OpenAI/Anthropic/Groq — see `LLM_PROVIDER`) |
| `postgres` | `pgvector/pgvector:pg17` | `vector` extension enabled once, at first setup |
| `redis` | `redis:7-alpine` | Used by BullMQ (`api` + `worker`) |

`api` and `worker` share one image — `apps/api/Dockerfile` builds once, `api` runs the Dockerfile's default `CMD`, `worker` overrides the command to `node dist/main.worker.js`.

Only `caddy` publishes ports to the host (80/443). Everything else — including Postgres and Redis — is reachable only over the internal Docker network. Caddy reverse-proxies `DOMAIN` → `web` and `API_DOMAIN` → `api`, and handles TLS automatically via Let's Encrypt.

## 1. Provision the server

Any Ubuntu 22.04+ (or similar) VM/dedicated server with a public IP works. Minimum realistic size: 2 vCPU / 4GB RAM (the `ai` service and Postgres are the heaviest).

1. Point DNS at the server before doing anything else — Caddy's automatic TLS needs both records resolvable when it first starts:
   - `A` record: your root/app domain (e.g. `app.example.com`) → server's public IP
   - `A` record: your API subdomain (e.g. `api.example.com`) → same IP
2. Install Docker Engine + the Compose plugin ([official install script](https://get.docker.com) is the fastest path: `curl -fsSL https://get.docker.com | sh`).
3. Open the firewall for SSH, HTTP, and HTTPS only:
   ```sh
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```
   Nothing else needs to be open — Postgres, Redis, and the app services are not published to the host (see Architecture above), so there's no equivalent rule needed for them. (Worth knowing generally: Docker inserts its own iptables rules for any port it *does* publish, which most host firewalls including `ufw` do not intercept by default — this compose setup sidesteps that entirely by not publishing those ports rather than relying on firewall rules to hide them.)
4. Clone the repo onto the server and `cd` into it.

## 2. Environment variables

Four separate env files, none committed:

**Root `.env`** (repo root — consumed by `docker-compose.prod.yml` for interpolation, e.g. `${DOMAIN}`):
```sh
POSTGRES_PASSWORD=   # generate: openssl rand -hex 24
DOMAIN=app.example.com
API_DOMAIN=api.example.com
NEXT_PUBLIC_API_URL=https://api.example.com   # baked into web's client bundle at build time
ACME_EMAIL=you@example.com                    # Let's Encrypt registration contact
```

**`apps/api/.env`** (copy from `apps/api/.env.example`, override for production):
- `JWT_SECRET`, `ENCRYPTION_KEY` → generate fresh values (`openssl rand -hex 32` for the encryption key) — do **not** reuse local dev values
- `FRONTEND_URL` → `https://app.example.com`
- `GOOGLE_CALLBACK_URL` / `GOOGLE_MAIL_CALLBACK_URL` / `GOOGLE_CALENDAR_CALLBACK_URL` and the Microsoft equivalents → `https://api.example.com/...`, and **must also be added as authorized redirect URIs in the Google Cloud Console / Azure App Registration** — this is the step most likely to get missed and silently break OAuth in production
- `DATABASE_URL` / `REDIS_HOST` / `REDIS_PORT` / `AI_SERVICE_URL` are already set correctly by `docker-compose.prod.yml`'s `environment:` block — leave them out of this file, the compose values win
- `NODE_ENV`, `LOG_LEVEL=info` (drop `debug` in production)

**`apps/ai/.env`** (copy from `apps/ai/.env.example`):
- Whichever `LLM_PROVIDER`'s API key you're using (`GOOGLE_API_KEY` etc.)
- `APP_ENV=production`, `APP_DEBUG=false`

**`apps/web/.env`** — not needed at runtime; `NEXT_PUBLIC_API_URL` is a *build* arg (see root `.env` above), not a container env var, because Next.js inlines `NEXT_PUBLIC_*` values into the client bundle at build time.

## 3. First deploy

From the repo root on the server:

```sh
# One-time: enable pgvector before the first migration, since the schema's
# HNSW index depends on it existing.
docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml exec postgres psql -U postgres -d ai_email -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Build every image and bring the full stack up. No separate migration
# step needed — apps/api/Dockerfile's CMD runs `prisma migrate deploy`
# automatically before starting the server, every time the `api`
# container boots (worker shares the image but overrides the command, so
# only api ever runs migrations).
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

Then:
1. `curl https://api.example.com/health` — confirm `api` is up and Caddy issued a cert.
2. Load `https://app.example.com` in a browser.
3. Log in via Google or Microsoft OAuth end-to-end once, confirming the redirect URIs configured in step 2 actually work — this is the one thing that can't be verified without a real OAuth round trip.

After this, `scripts/deploy.sh` does all of the above (minus the one-time `CREATE EXTENSION`) for every subsequent deploy — see below.

## 4. Ongoing deploys

`scripts/deploy.sh` (checked into the repo) does the full cycle: `git pull` → rebuild → `prisma migrate deploy` → restart → wait for `api` to report healthy → prune old images. Run it two ways:

- **Manually**, SSH'd into the server: `./scripts/deploy.sh`
- **From GitHub Actions**: `.github/workflows/deploy.yml`, triggered manually from the Actions tab (`workflow_dispatch`) rather than automatically on push — a production deploy shouldn't fire just because someone pushed to master. It SSHes in and runs the same script. Needs these repository secrets:
  - `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (a private key whose public half is in the server's `~/.ssh/authorized_keys`), `DEPLOY_PORT` (optional, defaults to 22), `DEPLOY_PATH` (the repo's absolute path on the server, e.g. `/home/deploy/ai-email-assistant`)
  - The workflow also targets a GitHub **environment** named `production` — set that up (Settings → Environments) if you want an additional required-reviewer approval gate before the SSH step runs, on top of the manual trigger.

`.github/workflows/ci.yml` (unchanged) runs typecheck + `api`'s Jest suite + `ai`'s pytest suite on every PR and push to `master` — `deploy.yml` is separate and only deploys whatever's already on `master`, so always confirm `ci.yml` is green on the commit you're deploying before triggering it.

## Rollback

```sh
git log --oneline   # find the last-known-good commit
git checkout <sha>
./scripts/deploy.sh
```

Database migrations are forward-only (per this repo's hand-written-migration convention, see `apps/api/prisma/migrations/`) — rolling back the app containers does not roll back the schema. A schema rollback means writing and applying a new down-migration, not reverting the deploy.

## Backups

Postgres data lives in the `postgres_data` named volume — nothing backs it up automatically. A simple daily dump via cron on the host:

```sh
0 3 * * * docker exec ai-email-postgres pg_dump -U postgres ai_email | gzip > /var/backups/ai_email_$(date +\%F).sql.gz
```

Prune old dumps and ship them somewhere off-box (object storage, etc.) — this crontab line only creates the local file.

## Monitoring

- Logs: `docker compose -f docker-compose.prod.yml logs -f [service]`
- Health: `api` exposes `/health`; `docker compose -f docker-compose.prod.yml ps` shows each container's health status
- No metrics/alerting stack wired up — out of scope for this pass, worth revisiting if uptime starts mattering enough to justify it

## Known gaps (not blocking, tracked here for later)

- `apps/ai` has 26 pre-existing `ruff` lint findings — not part of this pass, worth a dedicated cleanup before it's part of the CI gate.
- No autoscaling / multi-region / blue-green — single VM, single instance per service, matching current usage. Revisit if that changes.
- No automated off-box backup shipping — the cron line above only writes locally.
