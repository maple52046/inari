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
# Next.js inlines basePath at build time, so the image bakes a placeholder that
# the entrypoint substitutes, keeping one image usable under any URL prefix.
# Passing --build-arg BASE_PATH=/dashboard instead locks the image to that
# prefix and makes the runtime BASE_PATH inert.
ARG BASE_PATH=""
ENV BASE_PATH=${BASE_PATH} \
    DEFER_BASE_PATH=true
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
# Entrypoint wrapper forces HOSTNAME=0.0.0.0 and applies BASE_PATH to the build
# output before the server loads (see docker/start.mjs).
COPY docker/start.mjs docker/base_path.mjs ./
EXPOSE 3000
# The distroless nodejs image's entrypoint is `node`, so this runs the wrapper.
CMD ["start.mjs"]
