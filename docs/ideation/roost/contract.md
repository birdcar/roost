# Roost Framework Contract

**Created**: 2026-04-10
**Confidence Score**: 95/100
**Status**: Approved
**Supersedes**: None

## Problem Statement

Cloudflare Workers is one of the most performant and cost-effective platforms for building web applications — edge computing, D1 databases, AI inference, object storage, queues, and durable state all available as first-party bindings. But there is no framework that makes this stack feel productive.

Developers building on Workers today wire up Drizzle, auth libraries, routing, and bindings manually for every project. There's no convention-over-configuration layer, no `artisan make:model`, no opinionated project structure that an AI agent (or a human) can rely on to move fast. Laravel proved that a good framework multiplies developer velocity by 5-10x — but Laravel targets PHP/Apache/MySQL, not the Cloudflare edge.

The person building this framework is also its first target user: a senior engineer who ships multiple Cloudflare-backed applications and wants to stop re-solving the same infrastructure problems. The secondary audience is any developer (human or AI) who wants Laravel-grade productivity on Cloudflare Workers.

## Goals

1. **Create a TypeScript framework for Cloudflare Workers** with Laravel-like conventions, file structure, and developer ergonomics — built as a composition layer over proven packages (Drizzle, TanStack Start, WorkOS SDK, Wrangler), not from scratch.

2. **Ship enterprise-ready auth from day one** via WorkOS integration — SSO, organizations, RBAC, session management, and directory sync wrapped in framework abstractions, not bolted on as an afterthought.

3. **Provide first-class AI primitives** modeled after Laravel 13's AI SDK and MCP implementation — class-based agents with typed tools, structured output, streaming, conversation memory, and MCP server support, all backed by Cloudflare AI.

4. **Abstract every Cloudflare binding** (D1, KV, R2, Queues, Durable Objects, AI, Vectorize, Hyperdrive) behind clean, Laravel-inspired interfaces so developers interact with the framework, not raw Wrangler APIs.

5. **Be AI-agent native** — predictable file conventions, extreme type safety, and a class+functional hybrid architecture that makes it trivial for LLMs to generate correct Roost code without churning.

6. **Ship a CLI** (`roost new`, `roost make:model`, `roost make:agent`, etc.) that scaffolds projects and generates code, so going from zero to running app takes minutes.

7. **Prove the framework works** with three example applications (todo app, AI chat app, SaaS starter) plus a documentation site and marketing page.

## Success Criteria

- [ ] `roost new my-app` creates a working Cloudflare Workers project with WorkOS auth, D1 database, TanStack Start frontend, and typed wrangler bindings — deployable with `wrangler deploy`
- [ ] A developer can define a Drizzle model, generate a migration, and run CRUD operations through a Laravel-like base model class in under 5 minutes
- [ ] WorkOS authentication (SSO, email+password, social login) works out of the box with session management, middleware guards, and organization/role support
- [ ] An AI agent can be defined as a class with typed tools, structured output, and streaming — using Cloudflare AI as the provider — in ~20 lines of code (matching Laravel AI SDK ergonomics)
- [ ] An MCP server can be exposed from a Roost app with class-based tools, resources, and prompts, testable without HTTP
- [ ] All 8 Cloudflare bindings (D1, KV, R2, Queues, Durable Objects, AI, Vectorize, Hyperdrive) have typed framework abstractions with consistent API patterns
- [ ] Background jobs can be dispatched to Cloudflare Queues with a Laravel Horizon-like API (dispatch, retry, monitor)
- [ ] Billing can be integrated via an abstract interface with a Stripe adapter (subscriptions, metering, customer portal)
- [ ] The todo example app demonstrates: auth, CRUD, server rendering, database operations
- [ ] The AI chat example app demonstrates: auth, agent with tools, streaming responses, conversation persistence
- [ ] The SaaS starter demonstrates: multi-tenant auth, billing, role-based access, job queues
- [ ] All framework code passes strict TypeScript checking with no `any` types in public APIs
- [ ] `bun test` runs the full test suite including fakes/mocks for AI, billing, and external services
- [ ] Documentation site covers: getting started, each package API, example walkthroughs
- [ ] An LLM given a Roost project can generate a new model, controller, and route by following conventions without framework-specific prompting

## Scope Boundaries

### In Scope

**Core Framework (@roostjs/core)**
- Service container / dependency injection
- Configuration management (convention-over-configuration)
- Middleware pipeline
- Base application class
- Wrangler bindings integration
- Environment/secrets management

**Routing & Frontend (TanStack Start on Vinxi/Nitro)**
- TanStack Start integration with Nitro's Cloudflare Workers preset
- TanStack Router for fully type-safe file-based routing
- Server functions via Vinxi for server-side data loading (RSC-ready architecture)
- Layout system, error boundaries
- Static asset handling via Vinxi/Nitro asset pipeline or R2

**Authentication (@roostjs/auth)**
- WorkOS SDK wrapper with framework-level abstractions
- Session management (Workers-compatible, KV-backed or cookie-based)
- Middleware guards (auth, guest, role, organization)
- Organization and multi-tenancy support
- Directory sync via WorkOS Events API
- WorkOS Widgets integration for prebuilt UI components

**ORM (@roostjs/orm)**
- Drizzle wrapper with Laravel-like model base class
- Migration generation and running
- Query builder with D1 optimizations
- Model relationships (hasOne, hasMany, belongsTo, belongsToMany)
- Model events/hooks
- Seeding and factories for testing

**Cloudflare Bindings (@roostjs/cloudflare)**
- D1 — database (via Drizzle, surfaced through @roostjs/orm)
- KV — key-value storage with typed get/put/delete, cache abstractions
- R2 — object/file storage with upload/download/presigned URLs
- Queues — job dispatch, retry, dead letter, consumer handlers
- Durable Objects — stateful actor abstractions
- AI — inference client wrapped by @roostjs/ai
- Vectorize — vector storage/search for RAG
- Hyperdrive — connection pooling for external databases

**AI SDK (@roostjs/ai)**
- Agent base class with decorator-driven configuration (@Provider, @Model, @MaxSteps, etc.)
- Tool definition with typed schemas (mirroring Laravel's JsonSchema builder)
- Structured output with schema validation
- Streaming responses (SSE-compatible for Workers)
- Conversation memory (D1-backed persistence)
- Middleware pipeline for agents
- Anonymous/inline agent function for one-offs
- Cloudflare AI as first-class provider, with extensible provider interface
- Testing fakes (Agent.fake(), assertPrompted(), etc.)

**MCP (@roostjs/mcp)**
- MCP Server base class with decorator metadata (@Name, @Version, @Instructions)
- Tool, Resource, and Prompt base classes
- Request/Response abstractions mirroring Laravel's
- SSE and HTTP transports on Workers
- Dynamic resource URI templates
- Tool annotations (@IsReadOnly, @IsDestructive, etc.)
- Testing utilities (Server.tool(ToolClass, args) pattern)

**Billing (@roostjs/billing)**
- Abstract billing interface (subscribe, cancel, swap, meter, portal)
- Stripe adapter as first implementation
- Webhook handling on Workers
- Subscription status middleware
- Customer model integration

**Queue/Jobs (@roostjs/queue)**
- Job base class with typed payloads
- Dispatch API (dispatch, dispatchAfter, chain, batch)
- Cloudflare Queues consumer integration
- Retry strategies, dead letter handling
- Job monitoring/status (Horizon-lite)

**CLI (@roostjs/cli)**
- `roost new <name>` — project scaffolding with WorkOS setup wizard
- `roost make:model` — generate model + migration
- `roost make:controller` — generate controller
- `roost make:agent` — generate AI agent class
- `roost make:tool` — generate AI tool class
- `roost make:mcp-server` — generate MCP server + tool
- `roost make:job` — generate queue job
- `roost make:middleware` — generate middleware
- `roost migrate` — run D1 migrations
- `roost dev` — start dev server (wraps wrangler dev)
- `roost deploy` — deploy to Workers (wraps wrangler deploy)

**Testing (@roostjs/testing)**
- Agent fakes and assertions
- Billing fakes and assertions
- Queue fakes and assertions
- HTTP test client for route testing
- Database test helpers (refresh, seed, factory)
- Built on bun:test

**Example Apps**
- Todo app (auth + CRUD + SSR + D1)
- AI chat app (auth + agents + streaming + conversation persistence)
- SaaS starter (multi-tenant auth + billing + RBAC + queues)

**Documentation & Marketing (built in Roost — dogfooding)**
- Documentation site built as a Roost app (getting started, package API docs, example walkthroughs)
- Marketing/landing page built as a Roost app — proves the framework can ship public-facing sites

### Out of Scope

- Non-Cloudflare deployment targets (Vercel, AWS Lambda, Deno Deploy) — Roost is Cloudflare-native by design
- Non-WorkOS auth providers (Auth0, Clerk, Firebase Auth) — WorkOS is the opinionated choice
- Non-TypeScript language support — Workers run TS/JS, Roost is TS-only
- GraphQL — REST/RPC patterns via TanStack Start loaders/server functions. GraphQL can be a future package
- Email sending — defer to a future @roostjs/mail package; not core to v0.1
- WebSocket abstractions — Durable Objects handle this at the binding level; no framework WebSocket layer in v0.1
- Admin panel / dashboard UI — framework provides primitives, not a prebuilt admin interface
- Package registry / marketplace — no third-party plugin ecosystem in v0.1

### Future Considerations

- `@roostjs/mail` — transactional email via Resend/Postmark
- `@roostjs/notifications` — multi-channel notifications (email, Slack, webhook)
- `@roostjs/websocket` — higher-level WebSocket abstractions over Durable Objects
- `@roostjs/admin` — auto-generated admin panel from models
- Plugin/package ecosystem with community contributions
- Multi-provider AI support (OpenAI, Anthropic direct, not just via CF AI)
- `roost deploy --preview` with preview URL generation
- Visual route inspector / debugging tools

## Execution Plan

_Added during Phase 5 handoff. Pick up this contract cold and know exactly how to execute._

### Dependency Graph

```
Phase 1: Foundation
  ├── Phase 2: TanStack Start ─┬── Phase 3: Auth
  │                              └── Phase 5: AI + MCP
  ├── Phase 4: ORM ─────────────── Phase 7: Billing
  └── Phase 6: Queue
                    ↓
         All runtime phases (2-7) feed into:
         Phase 8: CLI  ┐
         Phase 9: Testing ┘ (parallel)
                    ↓
         Phase 10: Example Apps (10a, 10b, 10c parallel)
                    ↓
         Phase 11: Docs + Marketing
```

### Execution Steps

**Strategy**: Hybrid — 5 waves with parallelism within waves.

**Wave 1** — Foundation _(sequential, blocks everything)_
```bash
/execute-spec docs/ideation/roost/spec-phase-1.md
```

**Wave 2** — Core runtime packages _(3 parallel after Wave 1)_

Start one Claude Code session, enter delegate mode (Shift+Tab), paste the Wave 2 agent team prompt below.

```bash
# Or run sequentially:
/execute-spec docs/ideation/roost/spec-phase-2.md
/execute-spec docs/ideation/roost/spec-phase-4.md
/execute-spec docs/ideation/roost/spec-phase-6.md
```

**Wave 3** — Dependent runtime packages _(parallel, start after their prerequisites complete)_

Phase 3 (Auth) starts after Phase 2 completes.
Phase 5 (AI+MCP) starts after Phase 2 completes.
Phase 7 (Billing) starts after Phase 4 completes.

```bash
# Run sequentially, or use agent team if Phases 2 and 4 finish close together:
/execute-spec docs/ideation/roost/spec-phase-3.md
/execute-spec docs/ideation/roost/spec-phase-5.md
/execute-spec docs/ideation/roost/spec-phase-7.md
```

**Wave 4** — CLI + Testing _(parallel after all runtime packages complete)_
```bash
/execute-spec docs/ideation/roost/spec-phase-8.md
/execute-spec docs/ideation/roost/spec-phase-9.md
```

**Wave 5** — Examples, then Docs _(sequential)_
```bash
# Example apps (can parallelize the 3 apps):
/execute-spec docs/ideation/roost/spec-phase-10a.md
/execute-spec docs/ideation/roost/spec-phase-10b.md
/execute-spec docs/ideation/roost/spec-phase-10c.md

# Documentation + Marketing (after examples):
/execute-spec docs/ideation/roost/spec-phase-11.md
```

### Agent Team Prompt — Wave 2

```
Phase 1 (Foundation) is complete. Create an agent team to implement 3 
core runtime packages in parallel. Each package is independent.

Spawn 3 teammates with plan approval required. Each teammate should:
1. Read their assigned spec file
2. Read spec-phase-1.md to understand the foundation they're building on
3. Explore packages/core and packages/cloudflare for patterns before planning
4. Plan their implementation approach and wait for approval
5. Implement following spec and codebase patterns
6. Run validation commands from their spec after implementation

Teammates:

1. "TanStack Start" — docs/ideation/roost/spec-phase-2.md
   TanStack Start integration with Vinxi/Nitro, file-based routing,
   context bridge to Roost container, server functions.

2. "ORM" — docs/ideation/roost/spec-phase-4.md
   Drizzle-based ORM with model classes, query builder, relationships,
   migrations, factories. Uses D1 binding from @roostjs/cloudflare.

3. "Queue" — docs/ideation/roost/spec-phase-6.md
   Job classes with typed payloads, dispatch API, Cloudflare Queues
   consumer, retry/dead letter. Uses Queues binding from @roostjs/cloudflare.

Coordinate on shared files: packages/core/src/index.ts may need
re-exports. Only one teammate should modify a shared file at a time.
```

### Agent Team Prompt — Wave 3

```
Waves 1-2 are complete (Foundation, TanStack Start, ORM, Queue).
Create an agent team to implement 3 dependent packages in parallel.

Spawn 3 teammates with plan approval required. Each teammate should:
1. Read their assigned spec file
2. Explore the existing codebase (packages/*) for patterns
3. Plan their implementation approach and wait for approval
4. Implement following spec and codebase patterns
5. Run validation commands from their spec after implementation

Teammates:

1. "Auth" — docs/ideation/roost/spec-phase-3.md
   WorkOS authentication, KV-backed sessions, middleware guards,
   multi-tenancy. Depends on Phase 2 (TanStack Start routing).

2. "AI + MCP" — docs/ideation/roost/spec-phase-5.md
   Agent classes, tools, structured output, streaming, MCP server.
   Depends on Phase 2 (routing for MCP HTTP transport).
   Creates @roostjs/schema as shared zero-dep package.

3. "Billing" — docs/ideation/roost/spec-phase-7.md
   Abstract billing interface, Stripe adapter (REST API, no Node SDK),
   webhooks, subscription middleware. Depends on Phase 4 (ORM).

Coordinate on shared files: @roostjs/schema (created by AI+MCP teammate)
should not conflict with others. Auth and Billing both add middleware
to packages/core — coordinate to avoid merge conflicts.
```
