#!/usr/bin/env bash
# Runs ON the VM (manually, or via .github/workflows/deploy.yml over SSH) —
# pulls latest master, rebuilds changed images, applies pending Prisma
# migrations, restarts the stack, and prunes old images. See
# docs/deployment.md for first-time setup; this script assumes the repo is
# already cloned and apps/api/.env, apps/ai/.env, and the root .env exist.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Pulling latest master"
git fetch origin master
git checkout master
git reset --hard origin/master

echo "==> Building images"
docker compose -f docker-compose.prod.yml build

# No separate migration step needed here — apps/api/Dockerfile's CMD runs
# `prisma migrate deploy` before starting the server, every time the `api`
# container boots. `worker` shares the same image but overrides the
# command entirely (see docker-compose.prod.yml), so only `api` ever runs
# migrations — no race between two containers migrating concurrently.
echo "==> Restarting stack"
docker compose -f docker-compose.prod.yml up -d

echo "==> Waiting for api to report healthy"
for i in $(seq 1 30); do
  status=$(docker inspect ai-email-api --format '{{.State.Health.Status}}' 2>/dev/null || echo "starting")
  if [ "$status" = "healthy" ]; then
    echo "api is healthy"
    break
  fi
  if [ "$i" = "30" ]; then
    echo "api did not become healthy in time — check: docker compose -f docker-compose.prod.yml logs api" >&2
    exit 1
  fi
  sleep 2
done

echo "==> Pruning old images"
docker image prune -f

echo "==> Deploy complete"
