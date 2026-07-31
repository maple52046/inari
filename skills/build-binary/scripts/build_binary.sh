#!/usr/bin/env bash
# Build a distributable Inari server binary for a target platform.
#
# The build runs inside a container rather than on the host. Two reasons: the
# TLS stack has C dependencies, so a host build would need a matching C
# cross-toolchain for every target, and the container image is musl-based, so
# the result is a fully static binary that runs on any Linux of that
# architecture regardless of its glibc.
#
# The web bundle is built and embedded by the same Dockerfile the container
# image uses, so this artefact and that image are produced by one path.
set -euo pipefail

OS="linux"
ARCH="amd64"
ENGINE="${CONTAINER_ENGINE:-}"
OUT_DIR=""

usage() {
  cat <<'USAGE'
Usage: build_binary.sh [os] [arch] [options]

  os      Target operating system (default: linux)
  arch    Target architecture     (default: amd64)

Options:
  --engine <docker|nerdctl>  Container engine (default: auto-detect docker then nerdctl)
  --out <dir>                Output directory (default: <repo>/dist)
  -h, --help                 Show this help

Supported targets:
  linux/amd64    builds natively on an amd64 host
  linux/arm64    needs qemu binfmt registered on an amd64 host

Env overrides: CONTAINER_ENGINE
USAGE
}

# Positional os/arch come first so the invocation reads `build_binary.sh linux arm64`.
if [ $# -gt 0 ] && [ "${1#-}" = "$1" ]; then
  OS="$1"
  shift
fi
if [ $# -gt 0 ] && [ "${1#-}" = "$1" ]; then
  ARCH="$1"
  shift
fi

while [ $# -gt 0 ]; do
  case "$1" in
    --engine) ENGINE="$2"; shift 2 ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

# Accept the spellings people actually type; the platform string needs the
# Docker/OCI form.
case "$ARCH" in
  amd64 | x86_64 | x86-64) ARCH="amd64" ;;
  arm64 | aarch64) ARCH="arm64" ;;
  *)
    echo "Unsupported architecture: $ARCH (expected amd64 or arm64)" >&2
    exit 2
    ;;
esac

# Refused rather than attempted: the TLS stack compiles C, so a macOS or Windows
# target needs that platform's SDK, which cannot be shipped in a Linux builder.
# Build those on their own host, or in CI on a matching runner.
if [ "$OS" != "linux" ]; then
  cat >&2 <<EOF
Unsupported operating system: $OS

Only linux targets can be built here. The server links a C-based TLS stack, so
a darwin or windows binary needs that platform's own SDK and toolchain. Build
it on a host of that platform with:

  cd server && cargo build --release

EOF
  exit 2
fi

PLATFORM="$OS/$ARCH"

if [ -z "$ENGINE" ]; then
  if command -v docker >/dev/null 2>&1; then
    ENGINE=docker
  elif command -v nerdctl >/dev/null 2>&1; then
    ENGINE=nerdctl
  else
    echo "Neither docker nor nerdctl found in PATH" >&2
    exit 1
  fi
fi

if ! command -v "$ENGINE" >/dev/null 2>&1; then
  echo "Container engine not found: $ENGINE" >&2
  exit 1
fi

# Building for a foreign architecture runs the compiler under emulation, which
# silently fails with "exec format error" when no handler is registered. Say so
# up front instead of letting the build die several minutes in.
HOST_ARCH="$(uname -m)"
case "$HOST_ARCH" in
  x86_64) HOST_ARCH="amd64" ;;
  aarch64) HOST_ARCH="arm64" ;;
esac

if [ "$ARCH" != "$HOST_ARCH" ] && ! ls /proc/sys/fs/binfmt_misc/ 2>/dev/null | grep -qi qemu; then
  cat >&2 <<EOF
Cannot build $PLATFORM on a $HOST_ARCH host: no qemu binfmt handler is
registered, so the cross-architecture compiler cannot run.

Register one (once per boot, needs privileges):

  $ENGINE run --privileged --rm tonistiigi/binfmt --install all

Then re-run this command.
EOF
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/dist}"
NAME="inari-server-$OS-$ARCH"

echo "Engine  : $ENGINE"
echo "Platform: $PLATFORM"
echo "Context : $ROOT_DIR"
echo "Output  : $OUT_DIR/$NAME"
echo

mkdir -p "$OUT_DIR"
STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

# The `export` stage holds nothing but the binary, and a local output writes it
# straight to disk. Nothing from the target platform is ever executed, which is
# what lets a foreign-architecture build be extracted at all -- and it sidesteps
# `cp`, which rootless nerdctl refuses on a stopped container.
"$ENGINE" build \
  --platform "$PLATFORM" \
  --target export \
  --output "type=local,dest=$STAGE_DIR" \
  "$ROOT_DIR"

if [ ! -f "$STAGE_DIR/inari-server" ]; then
  echo "Build produced no binary at $STAGE_DIR/inari-server" >&2
  exit 1
fi

mv "$STAGE_DIR/inari-server" "$OUT_DIR/$NAME"
chmod +x "$OUT_DIR/$NAME"

( cd "$OUT_DIR" && sha256sum "$NAME" > "$NAME.sha256" )

echo
echo "Built: $OUT_DIR/$NAME"
ls -lh "$OUT_DIR/$NAME" | awk '{print "Size : " $5}'
if command -v file >/dev/null 2>&1; then
  file -b "$OUT_DIR/$NAME" | sed 's/^/Type : /'
fi
echo "SHA  : $(cut -d' ' -f1 "$OUT_DIR/$NAME.sha256")"

# Proving it starts is only possible for the host's own architecture; a foreign
# binary would need the same emulation the build did.
if [ "$ARCH" = "$HOST_ARCH" ]; then
  echo
  echo "Smoke test:"
  PORT="$(shuf -i 39000-39999 -n 1)"
  SESSION_SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n')" \
    PORT="$PORT" "$OUT_DIR/$NAME" >/tmp/inari-smoke-$$.log 2>&1 &
  SMOKE_PID=$!
  for _ in $(seq 1 20); do
    if curl -sf "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then break; fi
    sleep 0.5
  done
  if curl -sf "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 \
    && curl -sf "http://127.0.0.1:$PORT/" 2>/dev/null | grep -q '<base href='; then
    echo "  healthz responds and the embedded web bundle is served"
  else
    echo "  FAILED -- see /tmp/inari-smoke-$$.log" >&2
    kill "$SMOKE_PID" 2>/dev/null || true
    exit 1
  fi
  kill "$SMOKE_PID" 2>/dev/null || true
  rm -f "/tmp/inari-smoke-$$.log"
fi
