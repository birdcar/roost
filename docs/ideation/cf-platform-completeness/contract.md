# Cloudflare Platform Completeness Contract

**Created**: 2026-04-14
**Confidence Score**: 95/100
**Status**: Approved
**Supersedes**: None

## Problem Statement

Roost wraps 8 Cloudflare bindings and provides a Laravel-inspired DX for building full-stack apps on Workers, but it only covers a fraction of the platform's capabilities. The "Architecting on Cloudflare" guide (architectingoncloudflare.com) documents 20+ patterns and primitives that production Cloudflare applications need — Workflows for durable execution, AI Gateway for observability/caching/fallbacks, D1 sessions for read-your-writes consistency, rate limiting, feature flags, structured observability, gradual rollout, and multi-tenant data isolation. Roost has none of these.

This gap matters because Roost's thesis is "the Laravel of Cloudflare Workers" — Laravel succeeds because it covers the full surface area of web development so developers never need to leave the framework. Right now, anyone building a production AI app or multi-tenant SaaS on Roost will immediately need to hand-roll the same 15 primitives that the CF architecture guide treats as baseline. That defeats the purpose of a framework.

Beyond platform gaps, Roost is missing Laravel primitives that have excellent CF mappings: Events (sync dispatch + queued listeners via Queues) and Broadcasting (private/presence channels over WebSockets via Durable Objects with hibernation). These are core to Laravel's appeal and map naturally to CF's architecture.

The AI story is especially thin: the `@roostjs/ai` package has an Agent class and a Workers AI provider, but no AI Gateway (the guide calls it "add for any production application"), no async inference, no RAG abstractions beyond a raw VectorStore, and no integration with CF's managed AI Search. A developer choosing Roost to build an AI-powered product gets less than they'd get reading the architecture guide and wiring things up themselves.

## Goals

1. **Full CF primitive coverage** — Every binding and platform feature the architecture guide recommends for production use has a Roost abstraction or scaffolded config, so developers never need to hand-wire CF primitives.
2. **Production-grade AI stack** — AI Gateway, RAG pipeline, async inference, MCP+AI Search, and agent durability via Workflows are all first-class Roost features.
3. **Production operations by default** — New `roost new` projects ship with structured logging, trace ID propagation, CPU limits, observability, and gradual rollout config out of the box.
4. **Multi-tenant depth** — Beyond OrgResolver, support database-per-tenant routing, tenant-scoped auto-filtering on queries, and tiered isolation strategies.
5. **Progressive disclosure DX** — Sensible defaults for basics (observability, CPU limits, placement), opt-in for advanced features (Workflows, Containers, Workers for Platforms). Scaffolded projects work out of the box; power features are one config change away.

## Success Criteria

- [ ] `roost new` projects include: observability enabled, CPU limits set, Smart Placement configured, trace ID middleware, structured logger
- [ ] `@roostjs/ai` supports AI Gateway proxy, async inference (`queueRequest`), prefix caching (`x-session-affinity`), and provider fallback chains
- [ ] A `RAGPipeline` class exists that handles chunking, embedding, Vectorize insert, and retrieval with configurable strategies
- [ ] `@roostjs/mcp` can expose AI Search instances as MCP resources
- [ ] Workflows have a Roost abstraction (`@roostjs/workflow` or integrated into `@roostjs/queue`) with a `roost make:workflow` generator
- [ ] `waitUntil()` is accessible from the Roost application context for fire-and-forget background work
- [ ] KV-based feature flags exist with a `FeatureFlag.isEnabled('flag-name')` API
- [ ] Rate limiting middleware exists in both KV (approximate) and DO (exact) variants
- [ ] Multi-tenant supports database-per-tenant routing and automatic tenant-scoped query filtering
- [ ] Service binding support exists in CloudflareServiceProvider with typed Worker-to-Worker calls
- [ ] Workers for Platforms dispatch namespace support exists for tenant-contributed code
- [ ] Container bindings are supported for workloads exceeding Worker limits
- [ ] HTMLRewriter has a Roost helper for common transformations (inject scripts, A/B test, localize)
- [ ] Webhook verification is generalized beyond Stripe (HMAC-SHA256, HMAC-SHA512, Ed25519)
- [ ] Content-addressable KV caching pattern is available as a utility
- [ ] Gradual rollout configuration is scaffolded in `wrangler.jsonc` and documented
- [ ] All new features have tests using Roost's existing fake/assert pattern
- [ ] All new features have `roost make:*` generators where applicable
- [ ] Laravel-style Event system exists with sync dispatch, queued listeners, and fake/assert testing
- [ ] Broadcasting via Durable Objects + WebSocket hibernation supports private and presence channels
- [ ] Docs site covers every new feature with at least a guide and concept page

## Scope Boundaries

### In Scope

- All 20 gaps identified in the audit plus Events + Broadcasting (see phasing below)
- New packages: `@roostjs/workflow`, `@roostjs/observability`, `@roostjs/feature-flags`, `@roostjs/events`, `@roostjs/broadcast`
- Extensions to existing packages: `@roostjs/ai`, `@roostjs/cloudflare`, `@roostjs/orm`, `@roostjs/auth`, `@roostjs/mcp`, `@roostjs/core`
- CLI generators for new primitives
- Wrangler template improvements (CPU limits, placement, gradual rollout)
- Test infrastructure for all new features
- Documentation for all new features

### Out of Scope

- Cloudflare Realtime (audio/video) — niche use case, low framework value-add over raw API
- Cloudflare R2 SQL (beta) — too early, API unstable
- Data Localization Suite — Enterprise add-on, complex compliance scope
- Workers Builds CI/CD — Cloudflare's own CI product, not a framework concern
- Sippy / Super Slurper migration tooling — operational, not framework
- Analytics Engine integration — analytics store, not app-layer concern
- Cloudflare Access integration — enterprise IdP federation, separate from app auth

### Future Considerations

- Cloudflare Containers as a managed compute tier for heavy AI workloads (GPU inference)
- Dynamic Workers for runtime code execution in AI agent tool chains
- Hybrid search (Vectorize + D1 FTS5) as a built-in RAG retrieval strategy
- Per-tenant usage metering and billing integration
- Agent-to-Workflow bridge (`AgentWorkflow` class from CF guide)

## Phases

### Phase 1: Production Foundations (defaults that ship with every project)

Progressive disclosure: ON by default.

| Gap | Deliverable |
|---|---|
| `waitUntil()` | Thread `ExecutionContext` through Application, expose `app.defer(promise)` |
| Observability | Structured logger with trace ID propagation, request ID middleware |
| CPU limits | Default `cpu_ms` in scaffolded `wrangler.jsonc` |
| Smart Placement | Default `placement: { mode: "smart" }` in scaffolded `wrangler.jsonc` |
| Gradual rollout | Gradual deploy config in `wrangler.jsonc`, documented rollback commands |

### Phase 2: AI Gateway + Enhanced AI Provider

Progressive disclosure: opt-in (requires AI Gateway ID config).

| Gap | Deliverable |
|---|---|
| AI Gateway | `GatewayAIProvider` that proxies through AI Gateway for caching, logging, fallbacks |
| Async inference | `queueRequest` option on `Agent.prompt()` and `AIClient.run()` with polling |
| Prefix caching | `x-session-affinity` header support for conversation continuity |
| Auto-detect AI/Vectorize bindings | Extend `CloudflareServiceProvider` to detect and register AI, Vectorize, DO, Hyperdrive |

### Phase 3: RAG Pipeline + AI Search

Progressive disclosure: opt-in (requires Vectorize index).

| Gap | Deliverable |
|---|---|
| RAG abstractions | `RAGPipeline` class: chunking strategies, embedding, Vectorize insert/query, context assembly |
| MCP + AI Search | `AiSearchResource` for `@roostjs/mcp` that exposes AI Search instances as queryable resources |

### Phase 4: Workflows (Durable Execution)

Progressive disclosure: opt-in (requires `--with-workflows` flag or manual setup).

| Gap | Deliverable |
|---|---|
| Workflows | `@roostjs/workflow` package with `Workflow` base class, step helpers, compensation patterns |
| CLI generator | `roost make:workflow` |

### Phase 5: Feature Flags + Rate Limiting

Progressive disclosure: feature flags ON by default (KV namespace), rate limiting opt-in.

| Gap | Deliverable |
|---|---|
| Feature flags | KV-based `FeatureFlag` class with `isEnabled()`, `getValue()`, and `FeatureFlagMiddleware` |
| Rate limiting | `RateLimitMiddleware` in KV (approximate) and DO (exact) variants |

### Phase 6: Multi-Tenant Data Isolation

Progressive disclosure: opt-in (requires tenant config).

| Gap | Deliverable |
|---|---|
| Tenant-scoped queries | Auto-inject `org_id` filter on Model queries when tenant context is active |
| Database-per-tenant | `TenantDatabaseResolver` that routes to per-tenant D1 bindings |
| D1 Sessions | `withSession()` integration in ORM for read-your-writes consistency |

### Phase 7: Service Architecture (Bindings, Platforms, Containers)

Progressive disclosure: all opt-in.

| Gap | Deliverable |
|---|---|
| Service bindings | Typed Worker-to-Worker bindings in `CloudflareServiceProvider`, `ServiceClient` wrapper |
| Workers for Platforms | `DispatchNamespace` wrapper, tenant dispatch patterns |
| Containers | `ContainerClient` binding wrapper for workloads exceeding Worker limits |

### Phase 8: Edge Utilities + Hardening

Progressive disclosure: mixed (HTMLRewriter opt-in, webhook/caching utilities always available).

| Gap | Deliverable |
|---|---|
| HTMLRewriter | `HtmlTransformer` helper for common patterns (script injection, A/B, localization) |
| Webhook verification | Generic `verifyWebhook()` supporting HMAC-SHA256, HMAC-SHA512, Ed25519 |
| Content-addressable KV | `VersionedKVStore` with content-hash keying and pointer-based invalidation |

### Phase 9: Events + Broadcasting (Laravel-style)

Progressive disclosure: Events ON by default, Broadcasting opt-in (requires DO binding).

| Gap | Deliverable |
|---|---|
| Events | `@roostjs/events` — `Event.dispatch()`, listeners (sync + queued), `EventServiceProvider`, subscriber pattern |
| Broadcasting | `@roostjs/broadcast` — `BroadcastableEvent`, `PrivateChannel`/`PresenceChannel`, `ChannelDO` with WebSocket hibernation |
| CLI generators | `roost make:event`, `roost make:listener`, `roost make:channel` |

**Laravel mapping reference**: See [laravel-mapping.md](./laravel-mapping.md) for detailed API alignment.

## Execution Plan

### Dependency Graph

```
Phase 1: Production Foundations
  ├── Phase 2: AI Gateway + Enhanced AI (blocked by 1 — needs waitUntil, observability)
  │     └── Phase 3: RAG Pipeline + AI Search (blocked by 2 — needs enhanced AI provider)
  ├── Phase 4: Workflows (blocked by 1 — needs waitUntil for async patterns)
  ├── Phase 5: Feature Flags + Rate Limiting (blocked by 1 — needs observability for metrics)
  ├── Phase 6: Multi-Tenant Isolation (blocked by 1 — needs request context threading)
  ├── Phase 7: Service Architecture (blocked by 1 — needs CloudflareServiceProvider extensions)
  ├── Phase 8: Edge Utilities (blocked by 1 — needs core patterns established)
  └── Phase 9: Events + Broadcasting (blocked by 1 — needs container/defer; blocked by 4 — queued listeners use Queue)
```

### Execution Steps

**Strategy**: Hybrid — Phase 1 sequential, then agent team for 2+4+5+6+7+8, then Phases 3+9.

1. **Phase 1** — Production Foundations _(blocking, must complete first)_
   ```bash
   /execute-spec docs/ideation/cf-platform-completeness/spec-phase-1.md
   ```

2. **Phases 2, 4, 5, 6, 7, 8** — parallel after Phase 1
   These phases have no dependencies on each other. Run as agent team or sequential.
   ```bash
   /execute-spec docs/ideation/cf-platform-completeness/spec-phase-2.md
   /execute-spec docs/ideation/cf-platform-completeness/spec-phase-4.md
   /execute-spec docs/ideation/cf-platform-completeness/spec-phase-5.md
   /execute-spec docs/ideation/cf-platform-completeness/spec-phase-6.md
   /execute-spec docs/ideation/cf-platform-completeness/spec-phase-7.md
   /execute-spec docs/ideation/cf-platform-completeness/spec-phase-8.md
   ```

3. **Phases 3, 9** — parallel after Phase 2 and Phase 4 respectively
   Phase 3 blocked by Phase 2 (needs enhanced AI provider). Phase 9 blocked by Phase 1 + Phase 4 (queued listeners need Queue package awareness).
   ```bash
   /execute-spec docs/ideation/cf-platform-completeness/spec-phase-3.md
   /execute-spec docs/ideation/cf-platform-completeness/spec-phase-9.md
   ```

### Agent Team Prompt

```
You are the lead coordinator for the Roost CF Platform Completeness initiative.

Execute these specs IN PARALLEL — each teammate gets one spec:

- Teammate "ai": /execute-spec docs/ideation/cf-platform-completeness/spec-phase-2.md
- Teammate "workflows": /execute-spec docs/ideation/cf-platform-completeness/spec-phase-4.md
- Teammate "flags-ratelimit": /execute-spec docs/ideation/cf-platform-completeness/spec-phase-5.md
- Teammate "multitenant": /execute-spec docs/ideation/cf-platform-completeness/spec-phase-6.md
- Teammate "service-arch": /execute-spec docs/ideation/cf-platform-completeness/spec-phase-7.md
- Teammate "edge-utils": /execute-spec docs/ideation/cf-platform-completeness/spec-phase-8.md

Coordinate on shared files:
- packages/cloudflare/src/provider.ts (ai + service-arch both modify CloudflareServiceProvider — ai adds AI/Vectorize detection, service-arch adds service bindings/containers)
- packages/cloudflare/src/bindings/index.ts (multiple teammates add new binding exports)
- packages/cli/src/index.ts (multiple teammates add new generators)
- packages/core/src/application.ts (may be touched by flags-ratelimit and multitenant for middleware registration)

Only one teammate should modify a shared file at a time. If two teammates need the same file, have the later one wait for the earlier to commit.

Each teammate: read your spec, implement it, run tests, commit atomically per component.

Also read docs/ideation/cf-platform-completeness/laravel-mapping.md — all wrappers
should follow Laravel API conventions where a mapping exists (e.g., Feature Flags
follow Pennant API, Rate Limiting follows RateLimiter facade, tenant scoping follows
Global Scopes pattern).
```

---

_This contract was generated from a cross-reference audit of architectingoncloudflare.com against the Roost codebase. Review and approve before proceeding to specification._
