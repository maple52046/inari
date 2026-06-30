# AGENTS.md

Guidance for AI agents (and human contributors) working in this repository.
This is a **TypeScript** project.

## Before doing any development work

If you are going to write or modify code (or other project artifacts), you MUST
read and follow these project standards first:

- **Architecture** - [`docs/standards/architecture.md`](docs/standards/architecture.md):
  the Clean Architecture dependency rule. Dependencies point inward only; the
  domain never depends on adapters, concrete drivers, or frameworks; data
  crossing boundaries is a domain-owned type; cross-layer work goes through
  abstractions (ports) implemented in outer layers and wired at the composition
  root.
- **TypeScript style** - [`docs/standards/typescript-style.md`](docs/standards/typescript-style.md):
  Use Google TypeScript Style as the baseline: named exports, ES modules, strict
  types, no `any` without a documented reason, `Error`-based exceptions for
  exceptional failures, TSDoc/JSDoc on exported APIs, and Prettier/ESLint/tsc as
  enforcement.
- **Comment content** - [`docs/standards/comment-content-rule.md`](docs/standards/comment-content-rule.md):
  a comment must belong to exactly one semantic category (Intent / Rationale /
  Contract / Invariant / Constraint / Risk / Side Effect / Domain Mapping /
  Operational Context) and must not restate code, translate names, or narrate
  control flow. Conversely, _do_ add a comment wherever a non-obvious decision,
  constraint, invariant, or risk needs to be recorded so it is not lost. API
  documentation comments are always expected where the style standard requires
  them.

Read the relevant standard(s) before editing, and keep your changes compliant.

## Additional standards (read when relevant)

- **Commit messages** - [`docs/standards/conventional-commits.md`](docs/standards/conventional-commits.md):
  Conventional Commits 1.0.0. Commit messages MUST be written in English.

## Project plans

Save project plan manuscripts under `docs/plans/manuscripts/` as
`YYYYMMDD-<short-topic>.md` (see
[`docs/plans/manuscripts/README.md`](docs/plans/manuscripts/README.md)). Create
or update the relevant plan file before implementing.

### Historical plans - do not read by default

`docs/plans/` holds historical, consolidated plans kept only for long-term
reference. Reading them wastes context/tokens and is almost never needed for
development.

- You MUST NOT open, read, search (grep), or glob any file directly under
  `docs/plans/` unless the user's task explicitly asks you to consult a specific
  historical plan.
- This does NOT block the normal plan workflow: you may still create or update
  drafts under `docs/plans/manuscripts/`, and read
  `docs/plans/manuscripts/README.md` when running the plan-consolidation skill.

## Skills

Task-specific operating guides live under `skills/` (see
[`skills/README.md`](skills/README.md) for the index). Read a skill only when
the current task matches its purpose. Cursor exposes them as `/`-commands via
thin wrappers under `.cursor/skills/`.
