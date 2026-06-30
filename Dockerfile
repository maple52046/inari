# syntax=docker/dockerfile:1

# --- Stage 1: install dependencies (cached on lockfile) ---
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Stage 2: build the standalone Next.js server ---
FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Runtime-only secret; a throwaway here keeps any build-time evaluation from
# tripping the fail-fast guard. It is never carried into the final image.
ENV SESSION_SECRET=build-only-placeholder-secret-0000000000
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- Stage 3: minimal distroless runtime ---
FROM gcr.io/distroless/nodejs24-debian12 AS runner
WORKDIR /app

ARG VERSION=0.1.0
LABEL org.opencontainers.image.title="Inari ${VERSION}" \
      org.opencontainers.image.description="Manage S3-compatible object storage." \
      org.opencontainers.image.source="https://github.com/maple52046/inari" \
      org.opencontainers.image.vendor="maple52046" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    NODE_OPTIONS=--use-system-ca
# Standalone output ships its own trimmed node_modules and server.js.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Entrypoint wrapper forces HOSTNAME=0.0.0.0 (see docker/start.mjs).
COPY docker/start.mjs ./start.mjs
EXPOSE 3000
# The distroless nodejs image's entrypoint is `node`, so this runs the wrapper.
CMD ["start.mjs"]
