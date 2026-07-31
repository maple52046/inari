# Rust Style Standard

Rust is a secondary implementation language of this project (TypeScript is the
primary one; see [`typescript-style.md`](typescript-style.md)). This standard
distills the Rust API Guidelines, the official Rust Style Guide, and the Linux
kernel Rust coding guidelines, keeping the rules that drive day-to-day
judgment. It is self-contained for open-source use.

> Sources: <https://rust-lang.github.io/api-guidelines/>,
> <https://doc.rust-lang.org/style-guide/>, and
> <https://docs.kernel.org/rust/coding-guidelines.html>. Formatting is enforced
> by `rustfmt`; lints by `clippy`. This document covers the judgment calls those
> tools cannot make.

## Baseline

- Use the Rust edition and toolchain pinned by the crate's `Cargo.toml` /
  `rust-toolchain.toml`. Pin the toolchain when a crate is added so local and CI
  builds agree.
- **Format with `rustfmt` default settings**; never hand-format around it and do
  not add project-local `rustfmt.toml` overrides without a recorded reason.
- **Lint with `clippy`**; treat warnings as errors in CI.
- Run `cargo fmt --check`,
  `cargo clippy --all-targets --all-features -- -D warnings`, and `cargo test`
  before committing.
- `#![forbid(unsafe_code)]` at the crate root unless the crate genuinely needs
  `unsafe`; a crate that keeps `unsafe` must justify it in the crate docs.

## Modules & imports

Let the module tree express the layering, and keep visibility as narrow as it
can be: private by default, `pub(crate)` for cross-module internals, `pub` only
for the crate's real API surface. Re-export the intended public surface from the
crate root (`pub use`) so callers depend on a stable path rather than the
internal tree.

Do not repeat module namespacing in item names: prefer `gpio::LineDirection::In`
over `gpio::gpio_line_direction::GPIO_LINE_DIRECTION_IN`. Avoid glob imports
except for a deliberate prelude and `use super::*` inside a test module. Import
types by name and call free functions through their module (`fs::read_to_string`)
when the bare name would be ambiguous.

## Types & data modelling

Make illegal states unrepresentable: model alternatives as `enum`s, wrap
meaningful primitives in newtypes (`struct BucketName(String)`) instead of
passing bare `String`/`u64` across boundaries, and prefer a dedicated type over
a `bool` parameter whose meaning is invisible at the call site.

Accept borrowed types in parameters (`&str`, `&[T]`, `impl AsRef<Path>`) and
return owned types; clone only when ownership is genuinely needed, not to escape
the borrow checker. Derive the standard traits eagerly where they make sense
(`Debug`, `Clone`, `PartialEq`, and `Copy` for small value types); `Debug` on
every public type. Implement `From`/`TryFrom` for conversions rather than
inventing ad-hoc constructors, and use a builder when a constructor would take
many optional arguments.

Use generics with trait bounds for compile-time polymorphism and `dyn Trait`
behind a pointer when the set of implementations must be chosen at runtime.
Mark functions whose return value must not be ignored with `#[must_use]`.

## Error handling

Return `Result<T, E>` for anything that can fail and propagate with `?`. Library
crates define their own error enum (typically via `thiserror`) so callers can
match on the failure; binaries and top-level application code may use `anyhow`
to add context. Preserve the cause chain: wrap with context instead of
stringifying and discarding the source error.

Do not use `unwrap` / `expect` on fallible runtime input (I/O, parsing,
environment, network). They are acceptable only for invariants that cannot fail
by construction, and then `expect` must state the invariant, not the symptom.
Panicking is a last resort for programmer errors; any public function that can
panic documents when in a `# Panics` section.

Every `unsafe` block is preceded by a `// SAFETY:` comment explaining why the
code cannot cause undefined behaviour, and every `unsafe fn` documents its
preconditions in a `# Safety` section. `# Safety` states the contract callers
must uphold; `// SAFETY:` shows that a specific call site upholds it.

## Naming

Use `UpperCamelCase` for types, traits, enum variants, and type parameters;
`snake_case` for crates, modules, functions, methods, variables, and lifetimes
(`'src`); `SCREAMING_SNAKE_CASE` for constants and statics. Treat acronyms as
words (`HttpClient`, `Uuid`), not as all-caps runs.

Follow the conversion conventions: `as_*` for cheap borrowed views, `to_*` for
expensive or owning conversions, `into_*` for consuming conversions. Getters are
named after the field (`name()`, not `get_name()`); mutable accessors take the
`_mut` suffix. Names describe domain meaning; when wrapping an external system's
concepts, stay close to the original names with Rust casing so the two sides
remain easy to cross-reference.

## Documentation

Write rustdoc (`///`) on every public item and `//!` at the top of each module
and crate to say what it is for. The first paragraph is a single sentence
describing what the item does; further explanation goes in later paragraphs.
Reference other Rust items with rustdoc's bracketed intra-doc link syntax so
they resolve to real links.

Use the conventional sections where they apply: `# Errors` for what a `Result`
returns and when, `# Panics` for panic conditions, `# Safety` for `unsafe`
preconditions, and `# Examples` for usage that a reader would otherwise have to
guess. Examples are compiled as doc tests, so keep them runnable and meaningful
rather than `Foo`/`Bar` placeholders.

## Comments

Comments explain **intent**, not mechanics. Never narrate what the code does.
The full content rule is binding: see
[`comment-content-rule.md`](comment-content-rule.md).

Comments are for implementers; documentation is for users. Do not use `//` to
document a public API, and do not use `///` for implementation notes. Write both
in Markdown, capitalize the first word, and end with a period - including tagged
comments such as `// SAFETY:` and `// TODO:`.

`TODO` format: `// TODO(owner): Describe the required follow-up and why it is not done now.`

## Functions, state & structure

Keep functions short and single-purpose. Use early returns and `?` instead of
deep nesting, and prefer iterator chains over manual index loops when they read
more clearly. Keep `match` arms exhaustive and avoid a catch-all `_` arm on
domain enums so adding a variant becomes a compile error rather than silent
fallthrough.

Prefer immutable bindings; introduce `mut` only where mutation is the point.
There is no global mutable state: `static mut` is forbidden, and shared state is
passed explicitly or held behind an appropriate synchronization type. Follow the
project's [architecture standard](architecture.md): domain and use-case crates
or modules define **traits as ports** and stay free of I/O, while adapters
implement those traits and are injected - through generics for static dispatch,
or `Arc<dyn Port>` when runtime selection is needed - at the composition root.

## Concurrency

`Send` and `Sync` are part of the public contract; state them in bounds
deliberately rather than discovering them by compile error. Prefer message
passing (channels) or a clearly owned `Arc<Mutex<T>>` over ad-hoc shared
mutation, and keep critical sections small.

In async code, never hold a `std::sync::Mutex` guard across an `.await`; use an
async-aware lock or restructure so the lock is released first. Do not perform
blocking work on an async runtime thread - move it to the runtime's blocking
pool. Cancellation, timeouts, and retries are part of the API contract at I/O
boundaries: an async function can be dropped at any await point, so state what
happens to in-flight work. The async runtime is an outermost-layer detail and
must not leak into domain types.

## Testing

Put unit tests beside the code in a `#[cfg(test)] mod tests` block and
integration tests, which exercise only the public API, under the crate's
`tests/` directory. Doc tests carry the public examples; keep them passing.

Name tests after the behaviour under test, not the function name. Test public
behaviour and architectural boundaries rather than private internals: implement
ports with test doubles instead of reaching into an adapter. `unwrap` / `expect`
is fine in tests, where a failed invariant should abort the test.

## Parting rule

**Be consistent** with surrounding code; let consistency converge toward this
standard over time rather than freezing an older local style.
