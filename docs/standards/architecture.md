# Architecture Standard

This project follows **The Clean Architecture** (Robert C. Martin). This
document adapts its single load-bearing rule - _The Dependency Rule_ - to a
TypeScript codebase. It is self-contained so the project can be used and
open-sourced independently.

> Source of the underlying principles: Robert C. Martin, _The Clean
> Architecture_, 2012. <https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html>

## The Dependency Rule

Source-code dependencies point **inwards only**. An inner layer must never name
anything declared in an outer layer (no function, type, constant, or data
format defined further out). Data crossing a boundary is a plain structure
owned by the inner layer - never a framework-shaped or driver-shaped value.

In TypeScript, enforce this through module boundaries: inner modules export
plain types, domain services, and port interfaces; outer modules import those
interfaces and provide implementations. Domain and use-case modules must not
import HTTP frameworks, database clients, UI libraries, environment parsers, or
other concrete drivers. If boundary tooling exists, configure ESLint or project
references so these imports fail early.

## Layers (inner to outer)

1. **Domain (innermost).** The core types of the system and the contracts that
   describe its behaviour. Pure data and abstractions: no I/O, no concurrency
   runtime, no clock, no filesystem, no third-party framework beyond a minimal
   data-modelling/serialization dependency.
2. **Use cases.** Application policy: orchestrate the domain types to fulfil a
   request. Depends only on the domain layer and on the **abstract ports**
   below - never on a concrete adapter.
3. **Interface adapters.** Convert between the domain form and the outside
   world: parsers/serializers, persistence backends, the CLI/HTTP surface.
   They depend inwards on the domain/use-case layers and implement the ports.
4. **Frameworks & drivers (outermost).** Concrete details: the runtime, the
   system clock, the filesystem, databases, network clients, third-party
   libraries. Mostly glue wired together at the composition root.

## Ports (cross dependencies via inversion)

When an inner layer must trigger work that lives further out (persist data, read
a clock, call a service), it depends on an **abstract port** - an abstraction
defined inward - and the outer layer provides the implementation. The use-case
layer references only these abstractions, so adding a new backend, a new
transport, or a new driver never edits the core.

Define TypeScript ports as small `interface`s owned by the domain or use-case
layer. Inject them through constructors or explicit function parameters. Adapter
classes or functions implement those interfaces in outer modules, and the
composition root wires concrete implementations to use cases. Do not hide this
wiring behind global singletons.

## Project rules derived from the above

- The domain MUST NOT depend on adapters, drivers, frameworks, or a concurrency
  runtime.
- A concrete adapter depends on the core's abstractions; the core never names a
  specific adapter. Adapters are selected at the composition root.
- Drivers sit behind ports. Swapping one driver for another is a new
  implementation of an existing abstraction, not a change to the domain or use
  cases.
- Data crossing boundaries is a domain-owned type, never a driver-specific
  structure or a raw record leaking outward.
- Side-effecting details (which database, which transport, which time source)
  are _details_ and live at the edges.

## Recommended layout

A typical TypeScript layout is:

```text
src/
  domain/          # domain entities, value objects, domain services, ports
  application/     # use cases and application-level orchestration
  adapters/        # HTTP/CLI/UI/persistence translators implementing ports
  infrastructure/  # concrete drivers, clients, process/env/runtime glue
  main.ts          # composition root; wires adapters to use cases
```

Keep imports pointing inward: `infrastructure` and `adapters` may import
`application` and `domain`; `application` may import `domain`; `domain` imports
neither adapters nor infrastructure. Feature folders are fine when they preserve
the same dependency direction internally.

## Testability consequence

Because policy does not depend on details, use cases and domain logic are
unit-testable without a runtime, without a real clock, and without touching the
filesystem or network - test doubles implement the ports. This is the property
the architecture exists to guarantee.
