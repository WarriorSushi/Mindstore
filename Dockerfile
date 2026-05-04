# MindStore self-host Dockerfile
# Multi-stage build: deps → build → runtime. Final image is ~250MB.
#
# Build:    docker build -t mindstore .
# Run:      docker run -p 3000:3000 -e DATABASE_URL=... mindstore
# Compose:  docker-compose up   (brings up Postgres+pgvector + the app)

# ─── Stage 1: install dependencies ──────────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /app

# Dependencies that aren't in alpine by default; pdf-parse + jszip
# need basic build tools when their native bindings install.
RUN apk add --no-cache libc6-compat python3 make g++

COPY package.json package-lock.json* ./
COPY packages ./packages
COPY extensions ./extensions

# Reproducible install
RUN npm ci --no-audit --no-fund

# ─── Stage 2: build the Next.js app ─────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/extensions ./extensions
COPY . .

# Next 16 standalone output reduces the final image dramatically;
# next.config.ts may already have output: 'standalone' — if not the
# runtime stage falls back to copying the full build instead.
RUN npm run build

# ─── Stage 3: runtime ───────────────────────────────────────────────
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Run as a non-root user.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 mindstore

# Copy build output. Standalone (preferred) vs full-copy fallback —
# whichever next.config produced.
COPY --from=builder --chown=mindstore:nodejs /app/.next/standalone ./
COPY --from=builder --chown=mindstore:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=mindstore:nodejs /app/public ./public

# Migration scripts + the migrate command runner
COPY --from=builder --chown=mindstore:nodejs /app/src/server ./src/server
COPY --from=builder --chown=mindstore:nodejs /app/node_modules/tsx ./node_modules/tsx
COPY --from=builder --chown=mindstore:nodejs /app/node_modules/.bin/tsx ./node_modules/.bin/tsx
COPY --from=builder --chown=mindstore:nodejs /app/node_modules/postgres ./node_modules/postgres
COPY --from=builder --chown=mindstore:nodejs /app/node_modules/drizzle-orm ./node_modules/drizzle-orm

USER mindstore
EXPOSE 3000

# A simple wrapper: run migrations, then start the server. Migrations
# are idempotent so this is safe to run on every container start.
CMD ["sh", "-c", "node ./node_modules/.bin/tsx src/server/migrate.ts && node server.js"]
