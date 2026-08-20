#!/usr/bin/env bash
# Build and push the Inari container image with either docker or nerdctl.
#
# Rationale: docker and nerdctl expose the same build/push CLI surface, so a
# single wrapper keeps the image repo and tag consistent regardless of engine
# and removes the chance of a hand-typed tag drifting from what gets deployed.
set -euo pipefail

REPO="${IMAGE_REPO:-ghcr.io/maple52046/inari}"
ENGINE="${CONTAINER_ENGINE:-}"
TAG=""
PUSH=1
TAG_LATEST=0

usage() {
  cat <<'USAGE'
Usage: build_push.sh [options]
  --engine <docker|nerdctl>  Container engine (default: auto-detect docker then nerdctl)
  --tag <tag>                Image tag (default: date +%Y%m%d-%H%M%S)
  --repo <repo>              Image repo (default: ghcr.io/maple52046/inari)
  --no-push                  Build only, do not push
  --latest                   Also tag and push :latest
  -h, --help                 Show this help

Env overrides: IMAGE_REPO, CONTAINER_ENGINE
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --engine) ENGINE="$2"; shift 2 ;;
    --tag) TAG="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --no-push) PUSH=0; shift ;;
    --latest) TAG_LATEST=1; shift ;;
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

# Auto-detect the engine when not pinned: docker is preferred only because it is
# the more common default; nerdctl is a drop-in for the commands used here.
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

# The tag doubles as the build-time VERSION label, matching the repo convention.
if [ -z "$TAG" ]; then
  TAG="$(date +%Y%m%d-%H%M%S)"
fi

IMAGE="$REPO:$TAG"

# Resolve the repo root from this script's location so it works from any cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../../.." && pwd)"

echo "Engine : $ENGINE"
echo "Context: $ROOT_DIR"
echo "Image  : $IMAGE"
[ "$TAG_LATEST" -eq 1 ] && echo "Also   : $REPO:latest"
[ "$PUSH" -eq 0 ] && echo "Push   : disabled (--no-push)"
echo

BUILD_ARGS=(--build-arg "VERSION=$TAG" -t "$IMAGE")
[ "$TAG_LATEST" -eq 1 ] && BUILD_ARGS+=(-t "$REPO:latest")

"$ENGINE" build "${BUILD_ARGS[@]}" "$ROOT_DIR"

if [ "$PUSH" -eq 1 ]; then
  "$ENGINE" push "$IMAGE"
  [ "$TAG_LATEST" -eq 1 ] && "$ENGINE" push "$REPO:latest"
fi

echo
echo "Built: $IMAGE"
if [ "$PUSH" -eq 1 ]; then
  echo "Pushed: $IMAGE"
  echo "Deploy with: kubectl -n inari set image deploy/inari inari=$IMAGE"
fi
