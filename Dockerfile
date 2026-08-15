# syntax=docker/dockerfile:1

# ---- Build stage: compiles TypeScript for all three workspace packages ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# better-sqlite3 falls back to compiling from source if no prebuilt binary
# matches the image's Node ABI/architecture, so build tools are required here.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json packages/web/package.json
RUN npm install
# better-sqlite3 ships prebuilt binaries for common platforms and skips
# compiling from source whenever one matches process.platform/arch - but that
# check ignores the glibc version, so a prebuild built against a newer glibc
# than this base image (ERR_DLOPEN_FAILED: GLIBC_x.xx not found) can still get
# picked. Removing the bundled prebuilds and rebuilding forces a binary that
# is guaranteed to match this exact image's glibc.
RUN rm -f node_modules/better-sqlite3/prebuilds/*.node \
  && npm rebuild better-sqlite3 --build-from-source

COPY . .
RUN npm run build

# ---- Runtime stage: only the compiled output + production dependencies ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
# tzdata is required for the TZ env var (see docker-compose.yml) to actually
# shift Date's local-time getters - without it the container silently stays
# in UTC regardless of TZ, which broke the auto-update scheduler's "HH:MM
# local-server-time" comparison in modules/admin/autoUpdateScheduler.ts.
RUN apt-get update && apt-get install -y --no-install-recommends tzdata \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_PATH=/app/data/notorious.db
ENV FILES_DIR=/app/data/files

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/server/package.json ./packages/server/package.json
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/web/dist ./packages/web/dist
COPY --from=build /app/docs/dashboard-seed.md ./docs/dashboard-seed.md

RUN mkdir -p /app/data/files

EXPOSE 4000
VOLUME ["/app/data"]

CMD ["sh", "-c", "node packages/server/dist/db/migrate.js && node packages/server/dist/server.js"]
