# TypeScript Style Standard

TypeScript is the primary implementation language of this project. This
standard distills Google TypeScript Style Guide, keeping the rules that drive
day-to-day judgment. It is self-contained for open-source use.

> Source: <https://google.github.io/styleguide/tsguide.html>. Formatting is
> enforced by Prettier; lints by ESLint and `tsc --noEmit`. This document covers
> the judgment calls those tools cannot make.

## Baseline

- Use the TypeScript version pinned by this project. New TypeScript configs
  should enable strict type checking unless an existing migration plan says
  otherwise.
- **Format with Prettier**; never hand-format around it.
- **Lint with ESLint and `tsc --noEmit`**; treat warnings as errors in CI.
- Run `tsc --noEmit`, `eslint`, `prettier --check .`, and the project's test
  command before committing.

## Modules & imports

Use ES modules, not namespaces, triple-slash references, or `import = require`.
Prefer named exports; do not use default exports in project code because they
create non-canonical names and hide bad imports. Export only symbols used by
other modules.

Prefer relative imports within the same project and keep parent-directory hops
short. Use `import type` / `export type` for type-only symbols. Side-effect
imports are allowed only when the module is intentionally loaded for its side
effects.

## Types & data modelling

Lean on inference for local obvious values, but annotate public APIs, complex
expressions, generic collections that would infer `unknown`, and values crossing
architectural boundaries. Prefer `interface` for object shapes and structural
ports. Use type aliases for unions, tuples, mapped types, and other non-object
shapes.

Avoid `any`. Use `unknown` at trust boundaries and narrow it before use. Avoid
`{}` as a type; prefer `unknown`, `object`, `Record<string, T>`, or a specific
interface. Prefer optional properties (`?`) over `| undefined`; add `| null` or
`| undefined` at use sites instead of baking nullability into broad aliases.

Use discriminated unions for expected domain outcomes and state machines. Keep
mapped and conditional types simple; some repetition is cheaper than clever
unreadable type machinery.

## Error handling

Use exceptions for exceptional failures and throw `Error` subclasses, never raw
strings or plain objects. Catch values as `unknown` and narrow them before use;
only handle non-`Error` throws when integrating with an API known to violate the
rule, and document that boundary.

Use typed results or discriminated unions when failure is an expected business
outcome that callers must branch on. Keep `try` blocks focused on the code that
can throw. Empty `catch` blocks require a comment explaining the contract or
risk being intentionally accepted.

Avoid non-null assertions and type assertions unless there is a real invariant
that TypeScript cannot express. Prefer runtime checks; when an assertion remains,
place the reason near the assertion.

## Naming

Use `UpperCamelCase` for classes, interfaces, type aliases, enums, decorators,
type parameters, and TSX component functions. Use `lowerCamelCase` for
variables, parameters, functions, methods, properties, and module aliases. Use
`CONSTANT_CASE` only for module-level immutable constants and enum values.

Names should describe the domain meaning, not repeat the type. Avoid ambiguous
abbreviations, Hungarian prefixes, and leading/trailing underscores. Treat
acronyms as words (`loadHttpUrl`, not `loadHTTPURL`) unless a platform name
requires otherwise. File names should be `snake_case` when adding new modules.

## Documentation

Use TSDoc/JSDoc (`/** ... */`) for documentation that callers should read, and
`//` for implementation comments. Document every top-level export and any
non-obvious public property or method. Do not write JSDoc type annotations that
TypeScript already expresses in the signature.

JSDoc should be Markdown-formatted. Use `@param` and `@returns` only when they
add contract, units, side effects, or constraints beyond the name and type.
Mark deprecated APIs with `@deprecated` and include the migration path.

## Comments

Comments explain **intent**, not mechanics. Never narrate what the code does.
The full content rule is binding: see
[`comment-content-rule.md`](comment-content-rule.md).

`TODO` format: `TODO(owner): describe the required follow-up and why it is not done now.`

## Functions, state & structure

Use `const` by default and `let` only for reassignment; never use `var`. Declare
one variable per statement. Prefer function declarations for named functions.
Use arrow functions for callbacks and when an explicit function expression is
needed; use block bodies when the return value is intentionally ignored.

Do not rely on Automatic Semicolon Insertion; write semicolons. Always use
`===` / `!==`, except `x == null` may be used intentionally to match both `null`
and `undefined`. Use braced control-flow blocks except for a short one-line
`if` where clarity improves.

Prefer readonly class fields and parameter properties for injected
collaborators. Use TypeScript visibility (`private`, `protected`) instead of
`#private`; omit `public` except on public parameter properties. Avoid container
classes full of static methods; export functions and constants from modules.

## Concurrency

Prefer `async` / `await` for asynchronous control flow. Return or await promises
so rejections are observed; fire-and-forget work must be explicit and justified
by an operational contract. Use `Promise.all` for independent work that should
fail as a group, and sequence awaits when ordering or rate limits matter.

Treat cancellation, timeouts, and retries as part of the API contract at I/O
boundaries. Pass `AbortSignal` or an equivalent cancellation mechanism when the
underlying library supports it.

## Testing

Place tests beside the code as `*.test.ts` / `*.spec.ts`, or under a project
`__tests__/` directory when that is the local convention. Use the project's
runner (commonly Vitest or Jest). Test public behavior and architectural
boundaries rather than private implementation details.

Use typed fixtures and builders instead of broad `as any` casts. When testing
invalid input or trust boundaries, keep unsafe casts local to the assertion and
explain why the test must bypass the type system.

## Parting rule

**Be consistent** with surrounding code; let consistency converge toward this
standard over time rather than freezing an older local style.
