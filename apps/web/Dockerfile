# Build context: repo root (needs the pnpm workspace: root package.json,
# pnpm-lock.yaml, pnpm-workspace.yaml, plus this app's source).
#
# NEXT_PUBLIC_* vars are baked into the client bundle at build time, so
# NEXT_PUBLIC_API_URL must be passed as a build arg, not a runtime env var.

FROM node:24-alpine AS base
RUN for i in 1 2 3 4 5; do corepack enable && break || sleep 5; done
WORKDIR /repo

FROM base AS build
COPY . .
ARG NEXT_PUBLIC_API_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN for i in 1 2 3 4 5; do \
      rm -rf node_modules apps/*/node_modules packages/*/node_modules; \
      pnpm install --frozen-lockfile && test -f apps/web/node_modules/.bin/next && break; \
      sleep 5; \
    done
RUN cd apps/web && node_modules/.bin/next build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["node", "server.js"]
