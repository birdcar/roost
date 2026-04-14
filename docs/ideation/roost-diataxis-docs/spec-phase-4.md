# Implementation Spec: Roost Diataxis Docs — Phase 4 (Concepts / Explanation)

**Contract**: ./contract.md
**Estimated Effort**: L

## Technical Approach

Phase 4 creates understanding-oriented explanation pages that answer "why?" and "how does this work conceptually?". These are the Diataxis *Explanation* pillar — discursive, reflective content that helps readers build mental models of Roost's architecture, design decisions, and trade-offs.

Inspired by Laravel 13's "Architecture Concepts" section (Request Lifecycle, Service Container, Service Providers, Facades) and their deeper explanatory content embedded within topic pages. Roost separates this cleanly: reference describes *what*, concepts explain *why*.

This phase includes both per-package concept pages (explaining the design behind each package) and cross-cutting architecture pages (explaining how packages work together, why the framework is structured this way, and what trade-offs were made).

**Explanation rules (Diataxis)**:
- Explains *why* things are the way they are — design decisions, trade-offs, history
- Discursive — can take perspectives, hold opinions, explore alternatives
- No procedural instructions — readers shouldn't "do" anything while reading
- Makes sense away from the product — reading material, not working material
- Draws connections between concepts and to the broader ecosystem
- Links to reference for specifics, links to guides for "how to do X"

## Feedback Strategy

**Inner-loop command**: `cd apps/site && bun run dev`

**Playground**: Dev server — verify concept pages render with good heading structure and readable prose.

**Why this approach**: Explanation pages are prose-heavy with minimal code. Visual verification confirms readability, heading hierarchy, and cross-linking.

## File Changes

### New Files

**Cross-cutting architecture pages**:

| File Path | Purpose |
|-----------|---------|
| `apps/site/src/routes/docs/concepts/architecture.tsx` | Roost's overall architecture and request lifecycle |
| `apps/site/src/routes/docs/concepts/service-container.tsx` | DI, service providers, and the boot sequence |
| `apps/site/src/routes/docs/concepts/edge-computing.tsx` | Why Cloudflare Workers — the edge computing model and its constraints |
| `apps/site/src/routes/docs/concepts/laravel-patterns.tsx` | Laravel-inspired patterns adapted for serverless TypeScript |
| `apps/site/src/routes/docs/concepts/testing-philosophy.tsx` | Fake-based testing, TestClient, and why mocks aren't used |

**Per-package concept pages**:

| File Path | Purpose |
|-----------|---------|
| `apps/site/src/routes/docs/concepts/core.tsx` | Why the container/pipeline/config architecture |
| `apps/site/src/routes/docs/concepts/cloudflare.tsx` | CF bindings model, why typed wrappers, binding resolution |
| `apps/site/src/routes/docs/concepts/start.tsx` | TanStack Start integration design, SSR on Workers |
| `apps/site/src/routes/docs/concepts/auth.tsx` | Why WorkOS, enterprise auth design, session architecture |
| `apps/site/src/routes/docs/concepts/orm.tsx` | Active Record on D1, query builder design, migration system |
| `apps/site/src/routes/docs/concepts/ai.tsx` | Agent abstraction, CF Workers AI architecture, provider model |
| `apps/site/src/routes/docs/concepts/mcp.tsx` | What MCP is, why it matters, server-side tool exposure |
| `apps/site/src/routes/docs/concepts/billing.tsx` | Abstract billing interface, why Stripe adapter pattern |
| `apps/site/src/routes/docs/concepts/queue.tsx` | CF Queues model, job lifecycle, retry strategies |
| `apps/site/src/routes/docs/concepts/cli.tsx` | Code generation philosophy, scaffolding conventions |
| `apps/site/src/routes/docs/concepts/testing.tsx` | Testing strategy, fakes over mocks, TestClient design |
| `apps/site/src/routes/docs/concepts/schema.tsx` | Fluent schema builder design, JSON Schema under the hood |

### Modified Files

| File Path | Changes |
|-----------|---------|
| `apps/site/src/components/doc-layout.tsx` | Add concept links under "Concepts" sidebar section |
| `apps/site/src/components/search.tsx` | Add concept page entries to search index |
| `apps/site/src/routes/docs/concepts/index.tsx` | Update landing page with links to all concept pages |

## Implementation Details

### Concept Page Structure (Template)

**Pattern to follow**: Existing package pages for JSX structure, but prose-focused with minimal code

```tsx
function Page() {
  return (
    <DocLayout title="{Topic}" subtitle="Understanding {topic area}">
      <h2>{Framing Question or Statement}</h2>
      <p>{Discursive explanation — 2-4 paragraphs}</p>

      <h2>{Design Decision or Trade-off}</h2>
      <p>{Why this approach was chosen over alternatives}</p>

      <h2>{Connection to Broader Context}</h2>
      <p>{How this relates to the ecosystem, other packages, or industry patterns}</p>

      <h2>Further Reading</h2>
      <ul>
        {/* Links to related reference, guides, and external resources */}
      </ul>
    </DocLayout>
  );
}
```

### Cross-Cutting Architecture Content

**Architecture** (`concepts/architecture.tsx`):
- What happens when a request hits a Roost app (request lifecycle)
- How the service container boots and wires dependencies
- How middleware pipelines process requests
- How TanStack Start routes connect to the Roost backend
- Diagram: Request → Worker → Application.boot() → Middleware Pipeline → Route Handler → Response

**Service Container** (`concepts/service-container.tsx`):
- What dependency injection is and why it matters for testability
- Singleton vs transient bindings — when to use each
- Service provider lifecycle: register() then boot()
- How bindings propagate through the container
- Comparison to Laravel's IoC container — what's similar, what's different on Workers

**Edge Computing** (`concepts/edge-computing.tsx`):
- Why Cloudflare Workers vs. traditional servers
- The constraints: no filesystem, no long-running processes, V8 isolates
- How Roost adapts Laravel patterns for these constraints
- D1 as the edge database — SQLite at the edge, consistency model
- KV, R2, Queues — which binding for which use case
- Cold starts and why they're negligible on Workers

**Laravel Patterns** (`concepts/laravel-patterns.tsx`):
- Which Laravel patterns Roost adopts and why (service providers, Eloquent-style ORM, middleware, artisan-style CLI)
- What's deliberately different (no facades, TypeScript-first, class decorators instead of config arrays)
- Trade-offs: convention vs. configuration on a different runtime
- Why "Laravel of Cloudflare Workers" — the DX philosophy

**Testing Philosophy** (`concepts/testing-philosophy.tsx`):
- Why fakes over mocks (Laravel's approach adapted)
- TestClient: testing HTTP without a running server
- Agent.fake(), Queue.fake() — predictable test doubles
- Why integration-style tests are preferred over unit tests for framework code
- Testing on Workers: what's different about the D1/KV test environment

### Per-Package Concept Content

Each per-package concept page explains the *design thinking* behind that package. Key topics per package:

**@roostjs/core**: Why a service container for Workers? How does DI work without a long-lived process? Why pipeline middleware instead of nested function calls?

**@roostjs/cloudflare**: Why wrap native bindings? The typed client pattern. How binding names are resolved from config. Why a single `AIClient.run()` instead of per-model methods.

**@roostjs/start**: Why TanStack Start over Next.js/Remix? How the context bridge connects server and client. SSR on Workers — what's different from Node.js SSR.

**@roostjs/auth**: Why WorkOS instead of rolling auth? Enterprise-first design. Session storage on KV. The organization model and multi-tenancy. RBAC design.

**@roostjs/orm**: Active Record on SQLite/D1. Why not Prisma? Query builder vs raw SQL. Migration design: up/down with rollback safety. Relationship loading strategies.

**@roostjs/ai**: Why class-based agents? The agentic loop: prompt → tool calls → resolution. Why CF Workers AI instead of direct API keys — no external API calls, runs on Cloudflare's infrastructure. The `AIProvider` interface: extensibility without complexity. Default model choice rationale.

**@roostjs/mcp**: What MCP is and why Roost supports it. Server-side tool exposure for AI integrations. How MCP tools relate to AI agent tools.

**@roostjs/billing**: Why an abstract billing interface? The adapter pattern for payment providers. Webhook signature verification. Subscription lifecycle state machine.

**@roostjs/queue**: How CF Queues work (consumer Workers, batching). Job lifecycle: dispatch → queue → consume → handle → success/failure. Retry with backoff. Why not cron triggers for recurring work.

**@roostjs/cli**: Code generation philosophy: generate once, own forever. Why scaffolding reduces decision fatigue. Convention enforcement through generators.

**@roostjs/testing**: See cross-cutting Testing Philosophy page — per-package page links there and adds package-specific testing context.

**@roostjs/schema**: Why a fluent builder instead of raw JSON Schema? Type inference from schema definitions. Shared schema between AI tools and MCP.

### Sidebar and Search

**Implementation steps**:
1. Add concept links to "Concepts" sidebar section in `doc-layout.tsx`, grouped as:
   - Architecture (architecture, service-container, edge-computing, laravel-patterns, testing-philosophy)
   - Package Concepts (core, cloudflare, start, auth, orm, ai, mcp, billing, queue, cli, testing, schema)
2. Add all concept pages and their `<h2>` sections to the search index
3. Update the concepts landing page with categorized links

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
|---|---|---|---|---|
| Concept content | Drifts into how-to territory | Writer adds step-by-step instructions | Fails Diataxis test — muddies explanation with procedure | Self-check: "Does this tell the reader *why* without telling them what to do?" If it has numbered steps, it's a guide |
| Concept content | Too abstract / no grounding | Explains concepts without connecting to real Roost code | Reader can't map understanding to practice | Reference specific source files and link to reference pages |
| Cross-cutting pages | Overlap with per-package | Architecture page repeats what AI concepts page says | Redundancy, maintenance burden | Cross-cutting pages cover *how packages interact*; per-package pages cover *why that package is designed this way* |

## Validation Commands

```bash
# Type checking
cd apps/site && bunx tsc --noEmit

# Dev server
cd apps/site && bun run dev

# Verify all concept files exist
ls apps/site/src/routes/docs/concepts/

# Count concept files (should be 17: 12 packages + 5 cross-cutting + 1 index — but index already exists from Phase 1)
ls apps/site/src/routes/docs/concepts/*.tsx | wc -l
```

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
