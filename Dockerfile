# syntax=docker/dockerfile:1

# =============================================================================
# articles-api — production image
#
# Multi-stage build:
#   1. deps    : installs production dependencies only, from the lockfile
#   2. runtime : minimal Alpine image running as the unprivileged `node` user (UID 1000)
# =============================================================================

ARG NODE_VERSION=22

# -----------------------------------------------------------------------------
# Stage 1 — production dependencies
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS deps

WORKDIR /app

# Copy manifests first so this layer stays cached until dependencies change
COPY package.json package-lock.json ./

RUN npm ci --omit=dev --ignore-scripts \
    && npm cache clean --force

# -----------------------------------------------------------------------------
# Stage 2 — runtime
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS runtime

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Application files stay owned by root (read-only for the runtime user)
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# Drop root privileges: built-in `node` user, referenced by numeric UID/GID so
# that runtimes (e.g. Kubernetes runAsNonRoot) can verify it is not root
USER 1000:1000

EXPOSE 3000

# Container-level health check backed by the API's /health endpoint
# (also verifies database connectivity). Uses Node itself: no curl/wget needed.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "-e", "require('http').get('http://127.0.0.1:' + (process.env.PORT || 3000) + '/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]

# Exec form: node receives signals directly (run with --init / `init: true`
# so that a minimal init process reaps zombies and forwards SIGTERM).
CMD ["node", "src/server.js"]
