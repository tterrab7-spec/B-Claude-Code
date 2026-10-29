# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc* ./
COPY packages/underwriting/package.json packages/underwriting/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @dirtbid/api... || pnpm install --filter @dirtbid/api...

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/underwriting packages/underwriting
COPY apps/api apps/api
RUN pnpm --filter @dirtbid/underwriting build && pnpm --filter @dirtbid/api build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
RUN pnpm prune --prod || true
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4000/v1/health || exit 1
# Run migrations, then serve.
CMD ["sh", "-c", "node --import tsx src/db/migrate.ts 2>/dev/null || node dist/db/migrate.js; node dist/server.js"]
