# syntax=docker/dockerfile:1

# --- Stage 1: build the SPA -------------------------------------------------
FROM node:24-alpine AS web
WORKDIR /build
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
# The bundle carries no deployment prefix: asset URLs are relative and the
# server injects a <base href> at request time, so one image runs under any
# BASE_PATH. This is what replaced the old start-up rewrite of the build output.
RUN npm run build

# --- Stage 2: build a static binary with the SPA embedded -------------------
# Alpine's toolchain is musl-native, so the C dependencies of the TLS stack
# build without a cross-compiler and the result is a fully static binary.
FROM rust:1.96-alpine AS server
WORKDIR /build
RUN apk add --no-cache musl-dev cmake make perl g++
# `rust-toolchain.toml` is deliberately not copied: the base image tag already
# pins the version, and the file would make rustup re-resolve and re-download a
# toolchain the image already has.
COPY server/Cargo.toml server/Cargo.lock ./
COPY server/src ./src
COPY server/tests ./tests
COPY --from=web /build/dist ../web/dist
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/build/target \
    cargo build --release && cp target/release/inari-server /inari-server

# --- Stage 3: binary-only export target -------------------------------------
# Targeted by `skills/build-binary` with `--output type=local` to lift the
# binary out without running anything, which is what makes extracting a
# foreign-architecture build possible.
#
# Deliberately placed before `runner`: the last stage is what an untargeted
# `docker build` produces, and that must stay the runtime image.
FROM scratch AS export
COPY --from=server /inari-server /inari-server

# --- Stage 4: nothing but the binary ----------------------------------------
FROM scratch AS runner

ARG VERSION=0.2.0
LABEL org.opencontainers.image.title="Inari ${VERSION}" \
      org.opencontainers.image.description="Manage S3-compatible object storage." \
      org.opencontainers.image.source="https://github.com/maple52046/inari" \
      org.opencontainers.image.vendor="maple52046" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.licenses="MIT"

# The server verifies backend certificates against the system trust store, which
# an empty image does not have. Carrying Alpine's bundle keeps the behaviour the
# Node version got from --use-system-ca.
#
# To trust an internal CA, mount it somewhere else and point
# INARI_EXTRA_CA_CERTS at it. Mounting over this bundle would replace the public
# roots instead of adding to them, breaking every public endpoint.
COPY --from=server /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=server /inari-server /inari-server

ENV PORT=3000 \
    HOST=0.0.0.0 \
    INARI_ENV=production
EXPOSE 3000

# No shell exists in this image, so this must stay exec form.
ENTRYPOINT ["/inari-server"]
