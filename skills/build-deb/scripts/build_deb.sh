#!/usr/bin/env bash
# Build the Inari Debian package.
#
# The binary comes from `skills/build-binary`, so the .deb and the container
# image are assembled from the same artefact and cannot drift. Because that
# binary is statically linked, the package has no library dependencies and
# installs on any Debian or Ubuntu of the same architecture regardless of its
# glibc.
set -euo pipefail

ARCH=""
VERSION=""
OUT_DIR=""
SKIP_BINARY=0

usage() {
  cat <<'USAGE'
Usage: build_deb.sh [arch] [options]

  arch    Target architecture (default: the host's; also amd64, arm64)

Options:
  --version <v>    Package version (default: read from server/Cargo.toml)
  --skip-binary    Reuse the binary already in the output directory
  --out <dir>      Output directory (default: <repo>/dist)
  -h, --help       Show this help

The package installs:
  /usr/bin/inari-server
  /etc/inari/config.env               (conffile)
  /usr/lib/systemd/system/inari.service

It leaves the service stopped and disabled; see debian/README.Debian.
USAGE
}

if [ $# -gt 0 ] && [ "${1#-}" = "$1" ]; then
  ARCH="$1"
  shift
fi

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --skip-binary) SKIP_BINARY=1; shift ;;
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

for tool in dpkg-buildpackage dh dpkg-architecture; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "$tool not found; install the 'debhelper' and 'dpkg-dev' packages" >&2
    exit 1
  fi
done

HOST_ARCH="$(dpkg-architecture -qDEB_HOST_ARCH)"
ARCH="${ARCH:-$HOST_ARCH}"
case "$ARCH" in
  amd64 | x86_64 | x86-64) ARCH="amd64" ;;
  arm64 | aarch64) ARCH="arm64" ;;
  *)
    echo "Unsupported architecture: $ARCH (expected amd64 or arm64)" >&2
    exit 2
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$ROOT_DIR"

# `debian/rules` looks for the binary under dist/, so a custom output directory
# would need the rules file parameterised too. Not worth the indirection.
if [ -n "$OUT_DIR" ] && [ "$OUT_DIR" != "$ROOT_DIR/dist" ]; then
  echo "--out is not supported: debian/rules reads the binary from dist/" >&2
  exit 2
fi
OUT_DIR="$ROOT_DIR/dist"

# One version for the crate and the package, so a .deb can always be traced
# back to the source that produced it.
if [ -z "$VERSION" ]; then
  VERSION="$(sed -n 's/^version = "\(.*\)"/\1/p' server/Cargo.toml | head -1)"
fi
if [ -z "$VERSION" ]; then
  echo "Could not determine the version; pass --version" >&2
  exit 1
fi

if [ "$SKIP_BINARY" -eq 0 ]; then
  echo "Building the $ARCH binary first..."
  skills/build-binary/scripts/build_binary.sh linux "$ARCH" --out "$OUT_DIR"
  echo
fi

BINARY="$OUT_DIR/inari-server-linux-$ARCH"
if [ ! -f "$BINARY" ]; then
  echo "Binary not found: $BINARY" >&2
  exit 1
fi

# Generated rather than committed, so the version lives in exactly one place.
# dpkg-buildpackage takes the package version from this file.
cat > debian/changelog <<EOF
inari ($VERSION) stable; urgency=medium

  * Release $VERSION. See the upstream repository for the full history.

 -- maple52046 <maple52046@users.noreply.github.com>  $(date -R)
EOF

# dh_installsystemd looks for debian/<package>.<unit>; copying keeps
# deploy/inari.service the single definition of how the service runs.
cp deploy/inari.service debian/inari.inari.service

# Binary-only: there is no upstream tarball to produce, and a source build
# would try to package the whole working tree.
dpkg-buildpackage -us -uc -b -a "$ARCH"

# dpkg-buildpackage writes beside the source tree, which is one level up.
DEB="$OUT_DIR/inari_${VERSION}_${ARCH}.deb"
mkdir -p "$OUT_DIR"
mv "$(dirname "$ROOT_DIR")/inari_${VERSION}_${ARCH}.deb" "$DEB"
rm -f "$(dirname "$ROOT_DIR")/inari_${VERSION}_${ARCH}".{buildinfo,changes}

( cd "$OUT_DIR" && sha256sum "$(basename "$DEB")" > "$(basename "$DEB").sha256" )

echo
echo "Built: $DEB"
ls -lh "$DEB" | awk '{print "Size : " $5}'
echo "SHA  : $(cut -d' ' -f1 "$DEB.sha256")"
echo
echo "Contents:"
dpkg-deb --contents "$DEB" | awk '$1 !~ /^d/ {print "  " $6}'
echo
echo "Install with:"
echo "  sudo apt install $DEB"
