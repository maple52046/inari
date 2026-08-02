# Development and build commands for the Rust server and the React SPA.
#
# Configuration comes from `.env`, which is git-ignored. Copy `.env.example` and
# fill in a SESSION_SECRET to get started.

set dotenv-load := true
set shell := ["bash", "-uc"]

server_dir := "server"
web_dir := "web"

# Port the Rust API listens on during development.
api_port := env_var_or_default("PORT", "3000")
# Port the Vite dev server listens on.
web_port := env_var_or_default("WEB_PORT", "5173")

_default:
    @just --list

# Run the API and the Vite dev server together.
#
# Vite proxies /api to the Rust server so the browser sees a single origin and
# the session cookie behaves exactly as it does in production.
dev:
    #!/usr/bin/env bash
    set -uo pipefail
    trap 'kill 0' EXIT
    just dev-api &
    just dev-web &
    wait

# Rebuild and restart the API whenever Rust sources change.
dev-api:
    cd {{server_dir}} && \
        INARI_ENV=development \
        watchexec --restart --exts rs,toml --watch src --watch Cargo.toml -- cargo run

# Run the API once, without the file watcher.
run-api:
    cd {{server_dir}} && INARI_ENV=development cargo run

# Serve the SPA with hot module replacement.
dev-web:
    cd {{web_dir}} && npm run dev

# Run every test suite.
test: test-server test-web

test-server:
    cd {{server_dir}} && cargo test

test-web:
    cd {{web_dir}} && npm run test

# Check formatting and lints across both sides.
lint:
    cd {{server_dir}} && cargo fmt --check
    cd {{server_dir}} && cargo clippy --all-targets --all-features -- -D warnings
    # Release too, because `cfg(debug_assertions)` makes the two configurations
    # compile different code: a debug-only branch leaves whatever it was the
    # only user of dead in release, and linting one profile would never see it.
    cd {{server_dir}} && cargo clippy --release --all-targets --all-features -- -D warnings
    cd {{web_dir}} && npm run lint
    cd {{web_dir}} && npm run typecheck

# Apply formatting.
fmt:
    cd {{server_dir}} && cargo fmt
    cd {{web_dir}} && npm run format

# Regenerate the TypeScript mirror of the wire types.
bindings:
    cd {{server_dir}} && cargo test export_bindings

# Debug build of both sides.
build: bindings
    cd {{web_dir}} && npm run build
    cd {{server_dir}} && cargo build

# Production build: the SPA is bundled first so the binary can embed it.
release: bindings
    cd {{web_dir}} && npm ci && npm run build
    cd {{server_dir}} && cargo build --release

# Standalone static binary with the SPA embedded, built in a container.
binary arch="amd64":
    skills/build-binary/scripts/build_binary.sh linux {{arch}}

# Debian package: binary, configuration, and systemd unit.
deb arch="":
    skills/build-deb/scripts/build_deb.sh {{arch}}

# Start a MinIO for integration tests, reachable on :9100.
minio-up:
    nerdctl run -d --name inari-test-minio --net host \
        -e MINIO_ROOT_USER=inari-dev \
        -e MINIO_ROOT_PASSWORD="$MINIO_DEV_PASSWORD" \
        -e MINIO_ADDRESS=:9100 \
        quay.io/minio/minio:latest server /data

minio-down:
    -nerdctl rm -f inari-test-minio
