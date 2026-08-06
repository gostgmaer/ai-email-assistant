# Build context: repo root (needs the pnpm workspace: root package.json,
# pnpm-lock.yaml, pnpm-workspace.yaml, plus this app's source).

FROM node:24-alpine AS base
RUN for i in 1 2 3 4 5; do corepack enable && break || sleep 5; done
WORKDIR /repo

FROM base AS build
COPY . .
RUN for i in 1 2 3 4 5; do \
      rm -rf node_modules apps/*/node_modules packages/*/node_modules; \
      pnpm install --frozen-lockfile && test -f apps/api/node_modules/.bin/prisma && break; \
      sleep 5; \
    done
RUN cd apps/api && node_modules/.bin/prisma generate
RUN cd apps/api && node_modules/.bin/nest build
RUN pnpm --filter api deploy --prod --legacy /deploy

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /deploy .
EXPOSE 3000
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/main.js"]
