---
name: build-deb
description: >-
  Build the Inari Debian package, which installs the binary, the configuration,
  and the systemd unit. Use when the user runs /build-deb or asks to produce a
  .deb, package Inari for Debian or Ubuntu, or prepare an apt-installable
  artefact. Container images are handled by build-image; a bare binary by
  build-binary.
disable-model-invocation: true
---

# build-deb

Build a `.deb` that installs the server, its configuration, and a systemd unit.
The service is deliberately left **stopped and disabled** after installation.

## Invocation

```
/build-deb [arch] [--version <v>] [--skip-binary] [-h | --help]
```

| Argument / option | Required | Description                                                       |
| ----------------- | -------- | ------------------------------------------------------------------- |
| `arch`            | No       | Target architecture. Default: the host's. Also `arm64`.           |
| `--version <v>`   | No       | Package version. Default: read from `server/Cargo.toml`.          |
| `--skip-binary`   | No       | Reuse the binary already in `dist/` instead of rebuilding it.     |
| `-h`, `--help`    | No       | Print the script's help and stop. Do not build.                   |

## Workflow

```
- [ ] 1. --help: print the help and stop
- [ ] 2. Run the helper script
- [ ] 3. Report the path, size, checksum, and contents
```

### 2. Build

```bash
skills/build-deb/scripts/build_deb.sh                 # host architecture
skills/build-deb/scripts/build_deb.sh arm64
skills/build-deb/scripts/build_deb.sh --skip-binary   # reuse dist/
```

The script builds the binary through `build-binary` first unless
`--skip-binary` is given, then runs `dpkg-buildpackage -b`.

### 3. Report

Report the path, size, SHA-256, and the installed file list. Mention that the
service does not start on install, since that is the part an operator has to
plan around.

## What the package installs

```
/usr/bin/inari-server                     the static binary, web bundle included
/etc/inari/config.env                     operator configuration (a dpkg conffile)
/etc/inari/secret.env                     generated in postinst, 0600, not a conffile
/usr/lib/systemd/system/inari.service
/usr/share/doc/inari/{README.Debian,copyright,changelog.gz}
```

## Decisions worth knowing

**The service does not start on install.** `dh_installsystemd --no-enable
--no-start`. A fresh install has no endpoint configured, so starting would only
produce a service nobody can use — and the server fails fast on missing
configuration, so it would not even stay up. An **upgrade** still restarts a
running service, which is the default `--restart-after-upgrade` behaviour and
is left on.

**The session secret is generated per host, in its own file.** It seals the
cookie holding each user's S3 credentials, so a value shipped in the package
would be identical everywhere. Keeping it out of the conffile also means an
upgrade never prompts about a file containing a secret. `SESSION_SECRET` in
`config.env` overrides it, which is what to do when several hosts share
sessions behind a load balancer.

**`Recommends: systemd`, not `Depends`.** A hard dependency makes the package
refuse to *configure* where systemd is absent, and a failed configure skips the
postinst that generates the secret — so the package would install into a broken
state rather than a usable one. The binary runs fine without systemd.

**The binary is built in a container, not by `debian/rules`.** The TLS stack
compiles C, so a host build needs a matching toolchain per target, and the musl
builder is what makes the result static. `debian/rules` overrides the
`dh_auto_*` targets to no-ops for the same reason it must: the repository root
holds both a Node.js project and a Rust crate, either of which debhelper would
otherwise try to build on its own.

**`HOST` defaults to `127.0.0.1`.** The service speaks plain HTTP and holds
sealed credentials, so it is meant to sit behind a TLS-terminating proxy. The
container image sets `0.0.0.0` in its own environment, so that path is
unaffected.

## Generated files

`debian/changelog` and `debian/inari.inari.service` are written by the script
and git-ignored. The changelog takes its version from `server/Cargo.toml`, and
the unit is copied from `deploy/inari.service`, so each has one source of truth.

## Operational notes

- `dist/` is git-ignored. Do not commit packages.
- Install with `sudo apt install ./inari_<version>_<arch>.deb`, which resolves
  the recommends; `dpkg -i` does not.
- `apt remove` stops the service and keeps `/etc/inari`; `apt purge` also
  removes the configuration and the generated secret.
- The package intentionally does not configure a reverse proxy. See
  `deploy/nginx.example.conf`.
