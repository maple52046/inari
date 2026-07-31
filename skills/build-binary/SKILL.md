---
name: build-binary
description: >-
  Build a distributable Inari server binary for a target OS and architecture,
  with the web bundle embedded. Use when the user runs /build-binary or asks to
  build, cross-compile, or produce a standalone Inari executable for release or
  for a systemd deployment. Container images are handled by the build-image
  skill.
disable-model-invocation: true
---

# build-binary

Produce a standalone `inari-server` executable with the web bundle compiled in,
plus its SHA-256. Building a container image is a separate concern — see the
`build-image` skill.

## Invocation

```
/build-binary [os] [arch] [--engine docker|nerdctl] [--out <dir>] [-h | --help]
```

| Argument / option | Required | Description                                                    |
| ----------------- | -------- | -------------------------------------------------------------- |
| `os`              | No       | Target operating system. Default: `linux`.                     |
| `arch`            | No       | Target architecture. Default: `amd64`. Also accepts `arm64`.   |
| `--engine <name>` | No       | Force `docker` or `nerdctl`. Default: auto-detect.             |
| `--out <dir>`     | No       | Output directory. Default: `dist/` at the repository root.     |
| `-h`, `--help`    | No       | Print the script's help and stop. Do not build.                |

`x86_64` and `aarch64` are accepted as spellings of `amd64` and `arm64`.

Env overrides: `CONTAINER_ENGINE`.

## Workflow

```
- [ ] 1. --help: print the help and stop
- [ ] 2. Confirm the engine is available and the target is supported
- [ ] 3. Run the helper script
- [ ] 4. Report the path, size, type, and checksum
```

### 1. `--help`

Run `skills/build-binary/scripts/build_binary.sh --help` and stop.

### 2. Confirm engine and target

The script auto-detects `docker` then `nerdctl` and refuses unsupported targets
before doing any work, so there is nothing to check by hand. It is worth knowing
*why* it refuses, because the reasons are not arbitrary:

- **Only `linux` builds here.** The server links a C-based TLS stack, so a
  `darwin` or `windows` binary needs that platform's own SDK. Those are built on
  a host of that platform, or in CI on a matching runner, with
  `cd server && cargo build --release`.
- **A foreign architecture needs emulation.** Building `linux/arm64` on an
  `amd64` host runs the compiler under qemu. The script checks for a registered
  binfmt handler and prints the one-line fix rather than letting the build die
  minutes in with `exec format error`.

### 3. Build

```bash
skills/build-binary/scripts/build_binary.sh                 # linux/amd64
skills/build-binary/scripts/build_binary.sh linux arm64
skills/build-binary/scripts/build_binary.sh --out /tmp/rel
```

Expect a few minutes on a cold cache. The Rust registry and target directory are
BuildKit cache mounts, so a rebuild after a source-only change is much faster.

### 4. Report

Report the output path, the size, the `file` type line, and the SHA-256. On a
native-architecture build the script also starts the binary, checks `/healthz`,
and confirms the embedded bundle is served; say whether that passed.

## How it works

The build runs **inside a container**, not on the host, targeting the `export`
stage of the repository `Dockerfile`. That stage holds nothing but the compiled
binary, and BuildKit writes it straight to disk with `--output type=local`.

Three consequences worth knowing:

- **No host Rust toolchain is needed**, and no C cross-toolchain either. A host
  build would need a matching C compiler for every target because of the TLS
  stack's native code.
- **The result is fully static** (`static-pie linked`), because the builder is
  musl-based. It runs on any Linux of that architecture regardless of its glibc
  version, which is what makes it usable for a systemd deployment.
- **Nothing from the target platform is executed** during extraction, which is
  the only reason pulling a foreign-architecture binary out works at all. It
  also sidesteps `cp`, which rootless nerdctl refuses on a stopped container.

The same `Dockerfile` produces the container image, so the binary and the image
come from one build path and cannot drift.

## Operational notes

- `dist/` is git-ignored. Do not commit binaries.
- The `export` stage sits **before** `runner` in the `Dockerfile` on purpose:
  the last stage is what an untargeted `docker build` produces, and that has to
  stay the runtime image.
- The binary embeds the web bundle, so it needs no files beside it. Verify that
  claim by running it from an empty directory.
- Deploying it is the `deploy/inari.service` path; see the repository README.
