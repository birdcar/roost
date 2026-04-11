# PRD: Roost Framework - Phase 1

**Contract**: ./contract.md
**Phase**: 1 of 11
**Focus**: Monorepo foundation, core framework abstractions, and Cloudflare bindings

## Phase Overview

Phase 1 establishes the entire foundation that every subsequent phase builds on. It creates the bun workspace monorepo structure, the core framework package (@roost/core), and typed abstractions for all eight Cloudflare Worker bindings (@roost/cloudflare).

This phase is sequenced first because nothing else can exist without it. The service container, configuration system, middleware pipeline, and binding abstractions are the bedrock. By the end of this phase, a developer has a typed, structured way to interact with every Cloudflare service — but no routing, no auth, no ORM yet. It's the engine without the car body.

The Cloudflare bindings are included in Phase 1 (rather than a separate phase) because they're leaf-level abstractions with no framework dependencies — they wrap Wrangler's `Env` types. Shipping them early means every subsequent phase can depend on typed bindings from day one (e.g., Phase 4 ORM uses the D1 binding, Phase 6 Queue uses the Queues binding).

## User Stories

1. As a framework developer, I want a bun workspace monorepo so that I can develop multiple Roost packages in parallel with shared tooling.
2. As a Roost app developer, I want a service container so that I can register and resolve dependencies with constructor injection.
3. As a Roost app developer, I want a configuration system that follows convention-over-configuration so that I spend minimal time on boilerplate setup.
4. As a Roost app developer, I want a middleware pipeline so that I can compose request/response transformations.
5. As a Roost app developer, I want typed abstractions for all Cloudflare bindings so that I interact with D1, KV, R2, Queues, Durable Objects, AI, Vectorize, and Hyperdrive through consistent, discoverable APIs.
6. As an AI agent generating Roost code, I want predictable file locations and naming conventions so that I can infer where code goes without being told.

## Functional Requirements

### Monorepo Structure

- **FR-1.1**: Bun workspace with `packages/` directory containing all @roost/* packages
- **FR-1.2**: Shared TypeScript configuration (strict mode, ES2022+, NodeNext modules)
- **FR-1.3**: Root-level bun scripts for building, testing, and linting all packages
- **FR-1.4**: Each package independently publishable to npm with its own package.json

### Service Container (@roost/core)

- **FR-1.5**: Class-based service container with singleton and transient bindings
- **FR-1.6**: Constructor injection via TypeScript decorators or explicit registration
- **FR-1.7**: Service provider pattern for package-level service registration
- **FR-1.8**: Container scoping for request-level isolation on Workers

### Configuration System (@roost/core)

- **FR-1.9**: Convention-based config loading from `config/` directory
- **FR-1.10**: Environment variable integration via Wrangler's `Env` type
- **FR-1.11**: Typed config access with dot-notation support (`config.get('database.default')`)
- **FR-1.12**: Config merging (defaults + environment overrides)

### Middleware Pipeline (@roost/core)

- **FR-1.13**: Composable middleware pipeline with before/after hooks
- **FR-1.14**: Middleware classes with `handle(request, next)` pattern
- **FR-1.15**: Global, group, and route-level middleware registration
- **FR-1.16**: Middleware ordering and priority support

### Base Application (@roost/core)

- **FR-1.17**: Application class that boots the service container, loads config, and wires bindings
- **FR-1.18**: Application lifecycle hooks (booting, booted, terminating)
- **FR-1.19**: Wrangler `fetch` handler integration — Application receives Worker requests

### Cloudflare Bindings (@roost/cloudflare)

- **FR-1.20**: D1 binding — typed database client wrapping Wrangler's D1Database
- **FR-1.21**: KV binding — typed get/put/delete/list with JSON serialization, TTL support, and cache-aside pattern
- **FR-1.22**: R2 binding — typed upload/download/delete/presigned-url with MIME detection
- **FR-1.23**: Queues binding — typed send/sendBatch with JSON payloads, delay support
- **FR-1.24**: Durable Objects binding — typed stub creation, alarm scheduling, state access
- **FR-1.25**: AI binding — typed inference client wrapping Wrangler's Ai type
- **FR-1.26**: Vectorize binding — typed insert/query/delete with metadata filtering
- **FR-1.27**: Hyperdrive binding — typed connection string extraction for external databases
- **FR-1.28**: All bindings auto-resolved from Wrangler `Env` via the service container

## Non-Functional Requirements

- **NFR-1.1**: Zero runtime dependencies beyond Cloudflare Workers built-ins — framework must not bundle Node.js polyfills
- **NFR-1.2**: Cold start overhead < 5ms — framework bootstrap must be negligible relative to Workers cold start
- **NFR-1.3**: Strict TypeScript with zero `any` types in public APIs
- **NFR-1.4**: All public APIs documented with JSDoc for editor autocomplete
- **NFR-1.5**: bun:test for all unit tests, targeting 90%+ line coverage on core

## Dependencies

### Prerequisites

- None — this is Phase 1

### Outputs for Next Phase

- Bun workspace monorepo with package structure
- @roost/core: service container, config, middleware pipeline, base Application
- @roost/cloudflare: typed bindings for all 8 Cloudflare services
- Shared TypeScript config and test infrastructure
- Convention documentation for file structure and naming

## Acceptance Criteria

- [ ] `bun install` at root installs all workspace dependencies
- [ ] `bun test` at root runs all package tests
- [ ] `bun run build` compiles all packages with zero TypeScript errors
- [ ] Service container resolves singleton and transient bindings correctly
- [ ] Config system loads from `config/` directory with env overrides
- [ ] Middleware pipeline executes in correct order with before/after hooks
- [ ] Application class boots and handles a Worker `fetch` request
- [ ] Each Cloudflare binding wrapper compiles with correct Wrangler types
- [ ] KV binding round-trips JSON values with TTL support
- [ ] R2 binding uploads and downloads with correct MIME types
- [ ] Queues binding sends typed messages with delay
- [ ] No `any` types in any public API surface
- [ ] All unit tests passing with bun:test
