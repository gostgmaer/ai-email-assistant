# AI Email Assistant

Monorepo:

| App | What it is | Stack |
|-----|-----------|-------|
| `apps/web` | Web app | Next.js |
| `apps/api` | REST API and queue worker | NestJS, Prisma, BullMQ |
| `apps/ai` | AI service | FastAPI, LangGraph |

## Local development

Everything runs from `docker-compose.yml`. The comments at the top of that
file list every service, port and override.

### Before the first run

1. Create `apps/api/.env` from `apps/api/.env.example`, and `apps/ai/.env`
   from `apps/ai/.env.example`. At minimum, `apps/ai/.env` needs an LLM key
   (for example `GOOGLE_API_KEY`).
2. Check out the file service next to this repo, at
   `WorkSpace/Backend/file-upload-service`. Or set `FILE_SERVICE_PATH` in a
   root `.env` to wherever it is.

### Whole stack

```sh
docker compose up -d --build
```

| Service | URL |
|---------|-----|
| Web app | http://localhost:3001 |
| API | http://localhost:3000 |
| AI service | http://localhost:8000 |
| Mailpit (emails the app sends) | http://localhost:8025 |
| pgAdmin | http://localhost:5050 |

Migrations run automatically when the `api` container starts.

### Run the apps natively, with dependencies in Docker

```sh
docker compose up -d postgres redis mongo file-service mailpit
```

Then start each app the usual way. The `.env.example` files already point at
the Docker ports:

| Dependency | Host port |
|------------|-----------|
| Postgres | 5433 |
| Redis | 6380 |
| File service | 4001 |
| Mailpit SMTP | 1025 |

```sh
cd apps/api && npx prisma migrate deploy && npm run start:dev   # API
cd apps/api && npm run build && npm run start:worker             # worker
cd apps/ai && uv run uvicorn main:app --port 8000                # AI service
cd apps/web && npx next dev -p 3001                              # web
```

### Tests

```sh
cd apps/api && npx jest
cd apps/ai && uv run pytest
cd apps/web && npx eslint . && npx tsc --noEmit
```
