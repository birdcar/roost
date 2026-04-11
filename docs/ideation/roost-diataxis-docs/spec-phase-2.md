# Implementation Spec: Roost Diataxis Docs — Phase 2 (Reference Documentation)

**Contract**: ./contract.md
**Estimated Effort**: L

## Technical Approach

Phase 2 creates proper Diataxis reference documentation for all 12 packages. The existing `/docs/packages/*` pages are a blend of tutorials, how-to guides, and reference — this phase extracts and rewrites only the **reference** content: neutral, factual descriptions of what each class, method, and configuration option *is* and *does*.

Reference docs mirror the product's structure. Each package gets one page under `/docs/reference/{package}.tsx`. Content is migrated from the existing pages, stripped of tutorial/how-to material, and expanded to cover the complete API surface. After migration, the old `/docs/packages/*` files are deleted.

Inspired by Laravel's approach: their Eloquent ORM docs have separate "Getting Started" (tutorial-ish), "Relationships" (how-to), and per-topic reference sections. We're splitting along Diataxis lines instead — reference is *only* neutral description.

**Reference docs must follow Diataxis rules**:
- Describe what things *are*, not what to do with them
- Structure mirrors product structure (classes, methods, config)
- Neutral tone — no opinions, no narrative, no guidance
- Complete — don't skip "obvious" things
- Consistent format across all packages

## Feedback Strategy

**Inner-loop command**: `cd apps/site && bun run dev`

**Playground**: Dev server — navigate reference pages and verify content renders correctly, TOC generates from headings, and code examples display properly.

**Why this approach**: Content pages are TSX with `DocLayout`, `CodeBlock`, and `Callout` components. Visual verification confirms rendering, heading structure, and code highlighting.

## File Changes

### New Files

| File Path | Purpose |
|-----------|---------|
| `apps/site/src/routes/docs/reference/core.tsx` | @roost/core reference |
| `apps/site/src/routes/docs/reference/cloudflare.tsx` | @roost/cloudflare reference |
| `apps/site/src/routes/docs/reference/start.tsx` | @roost/start reference |
| `apps/site/src/routes/docs/reference/auth.tsx` | @roost/auth reference |
| `apps/site/src/routes/docs/reference/orm.tsx` | @roost/orm reference |
| `apps/site/src/routes/docs/reference/ai.tsx` | @roost/ai reference |
| `apps/site/src/routes/docs/reference/mcp.tsx` | @roost/mcp reference |
| `apps/site/src/routes/docs/reference/billing.tsx` | @roost/billing reference |
| `apps/site/src/routes/docs/reference/queue.tsx` | @roost/queue reference |
| `apps/site/src/routes/docs/reference/cli.tsx` | @roost/cli reference |
| `apps/site/src/routes/docs/reference/testing.tsx` | @roost/testing reference |
| `apps/site/src/routes/docs/reference/schema.tsx` | @roost/schema reference |

### Modified Files

| File Path | Changes |
|-----------|---------|
| `apps/site/src/components/doc-layout.tsx` | Add per-package links under the "Reference" sidebar section |
| `apps/site/src/components/search.tsx` | Replace `/docs/packages/*` entries with `/docs/reference/*` entries |
| `apps/site/src/routes/docs/reference/index.tsx` | Update landing page with links to all 12 package reference pages |

### Deleted Files

| File Path | Reason |
|-----------|--------|
| `apps/site/src/routes/docs/packages/core.tsx` | Content migrated to `/docs/reference/core` |
| `apps/site/src/routes/docs/packages/cloudflare.tsx` | Content migrated |
| `apps/site/src/routes/docs/packages/start.tsx` | Content migrated |
| `apps/site/src/routes/docs/packages/auth.tsx` | Content migrated |
| `apps/site/src/routes/docs/packages/orm.tsx` | Content migrated |
| `apps/site/src/routes/docs/packages/ai.tsx` | Content migrated |
| `apps/site/src/routes/docs/packages/mcp.tsx` | Content migrated |
| `apps/site/src/routes/docs/packages/billing.tsx` | Content migrated |
| `apps/site/src/routes/docs/packages/queue.tsx` | Content migrated |
| `apps/site/src/routes/docs/packages/cli.tsx` | Content migrated |
| `apps/site/src/routes/docs/packages/testing.tsx` | Content migrated |
| `apps/site/src/routes/docs/packages/schema.tsx` | Content migrated |

## Implementation Details

### Reference Page Structure (Template for all 12 packages)

**Pattern to follow**: `apps/site/src/routes/docs/packages/ai.tsx` (existing page structure), but **strip all tutorial/how-to content**

Every reference page follows this structure:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { DocLayout } from '../../../components/doc-layout';
import { CodeBlock } from '../../../components/code-block';

export const Route = createFileRoute('/docs/reference/{package}')({ component: Page });

function Page() {
  return (
    <DocLayout title="@roost/{package}" subtitle="{one-line factual description}">
      <h2>Installation</h2>
      {/* bun add command */}

      <h2>Configuration</h2>
      {/* Environment variables, service provider registration, config options */}

      <h2>{Primary Abstraction} API</h2>
      {/* Constructor, properties, methods — each as h4 with signature */}

      <h2>{Secondary Abstraction} API</h2>
      {/* Same pattern */}

      <h2>Types</h2>
      {/* Exported interfaces, enums, type aliases */}

      <h2>Decorators</h2>
      {/* If applicable — decorator signatures and what they set */}
    </DocLayout>
  );
}
```

**API entry format** (consistent across all pages):
```tsx
<h4><code>methodName(param: Type, param2?: Type): ReturnType</code></h4>
<p>Neutral description of what it does. No guidance on when to use it.</p>
```

### Per-Package Reference Content Guide

Each package's reference page must cover its complete public API. Source of truth is the package source code in `packages/{name}/src/`. Read the actual source to ensure completeness — the existing docs pages may be incomplete.

**@roost/core** — `packages/core/src/`
- `RoostContainer`: `singleton()`, `bind()`, `resolve()`, `has()`, `flush()`
- `ConfigManager`: `get()`, `set()`, `has()`, `all()`
- `Pipeline`: `send()`, `through()`, `then()`
- `Application`: `create()`, `boot()`, `register()`, lifecycle
- `ServiceProvider`: `register()`, `boot()`, abstract base class

**@roost/cloudflare** — `packages/cloudflare/src/`
- `D1Client`: query, batch, raw operations
- `KVClient`: get, put, delete, list
- `R2Client`: put, get, delete, list, head
- `QueueClient`: send, sendBatch
- `AIClient`: `run()` method signature and options
- `VectorizeClient`: insert, query, upsert
- `DurableObjectClient`: `get()`, stub methods
- `HyperdriveClient`: connect, pool config
- Binding resolution from `wrangler.jsonc`

**@roost/start** — `packages/start/src/`
- `RoostStartPlugin`: Vite plugin config
- Context bridge: `getServerContext()`, `createServerFn()`
- Route integration with TanStack Start

**@roost/auth** — `packages/auth/src/`
- `AuthManager`: `user()`, `check()`, `id()`, `organization()`, `logout()`
- `AuthMiddleware`: route protection, role checks
- `SessionManager`: `get()`, `set()`, `destroy()`, `regenerate()`
- `WorkOSProvider`: config, redirect URL, callback handling
- RBAC: `can()`, `hasRole()`, `hasPermission()`
- Multi-tenancy: `organization()`, `switchOrganization()`

**@roost/orm** — `packages/orm/src/`
- `Model`: define, attributes, timestamps, soft deletes
- `QueryBuilder`: `where()`, `orderBy()`, `limit()`, `offset()`, `join()`, `groupBy()`
- Relationships: `hasOne()`, `hasMany()`, `belongsTo()`, `belongsToMany()`
- Lifecycle hooks: `creating`, `created`, `updating`, `updated`, `deleting`, `deleted`
- Migrations: `Migration` base class, `up()`, `down()`, column types
- Factories: `Factory` class, `define()`, `create()`, `make()`
- Seeders: `Seeder` class, `run()`

**@roost/ai** — `packages/ai/src/`
- `Agent`: `instructions()`, `prompt()`, `stream()`, `tools()`, conversation memory
- `Tool` interface: `description()`, `schema()`, `handle()`
- `ToolRequest`: `get<T>(key)`
- Decorators: `@Model`, `@MaxSteps`, `@Temperature`, `@MaxTokens`, `@Provider`, `@Timeout`
- `CloudflareAIProvider`: the only built-in provider — wraps CF Workers `Ai` binding
- `AIClient` (from `@roost/cloudflare`): `run()` method
- Default model: `@cf/meta/llama-3.1-8b-instruct`
- **Critical**: Document that this uses CF Workers AI exclusively. No API keys. The `AI` binding must exist in `wrangler.jsonc`.

**@roost/mcp** — `packages/mcp/src/`
- `McpServer`: `tools()`, `resources()`, `prompts()`, `handle()`
- `McpTool`: `description()`, `schema()`, `handle()`
- `McpResource`: `uri()`, `name()`, `read()`
- `McpPrompt`: `name()`, `description()`, `messages()`

**@roost/billing** — `packages/billing/src/`
- `BillingProvider` interface: abstract billing operations
- `StripeAdapter`: Stripe-specific implementation
- `Customer`: `create()`, `retrieve()`, `update()`
- `Subscription`: `create()`, `cancel()`, `resume()`, `swap()`
- `BillingMiddleware`: subscription gate for routes
- Webhook handler: event routing, signature verification

**@roost/queue** — `packages/queue/src/`
- `Job` base class: `handle()`, `failed()`, `retries()`, `backoff()`
- `Queue.dispatch()`, `Queue.dispatchChain()`, `Queue.dispatchBatch()`
- `QueueServiceProvider`: registration and config
- Job lifecycle: dispatch → handle → success/failure

**@roost/cli** — `packages/cli/src/`
- `roost new` command: flags, generated structure
- `roost make:model`, `make:controller`, `make:agent`, `make:job`, `make:middleware`, `make:tool`
- `roost migrate`, `roost migrate:rollback`, `roost migrate:fresh`
- `roost deploy`
- `roost db:seed`

**@roost/testing** — `packages/testing/src/`
- `TestClient`: `get()`, `post()`, `put()`, `patch()`, `delete()`, `json()`, `send()`
- Response assertions: `assertStatus()`, `assertJson()`, `assertHeader()`, `assertRedirect()`
- Fakes: per-package fakes (Agent.fake, Queue.fake, etc.)
- Database helpers: `refreshDatabase()`, `seed()`

**@roost/schema** — `packages/schema/src/`
- `schema.string()`, `.number()`, `.boolean()`, `.enum()`, `.array()`, `.object()`
- Modifiers: `.optional()`, `.description()`, `.default()`
- Used by: `@roost/ai` tools, `@roost/mcp` tools

### Sidebar and Search Updates

**Implementation steps**:
1. Update `doc-layout.tsx` sidebar "Reference" section with links to all 12 packages
2. Replace all `/docs/packages/*` entries in `searchIndex` with corresponding `/docs/reference/*` entries
3. Add section-level entries for major API headings in each reference page
4. Update the reference landing page (`/docs/reference/index.tsx`) with categorized links matching the current grouping: Core, Features, Tooling

### Content Migration Process (per package)

For each of the 12 packages:
1. Read the existing `/docs/packages/{name}.tsx` content
2. Read the actual package source in `packages/{name}/src/` to verify completeness
3. Create `/docs/reference/{name}.tsx` with only reference-appropriate content:
   - **Keep**: Installation, configuration, API signatures, type definitions, decorator descriptions
   - **Remove**: Setup walkthroughs (→ guides), usage tutorials (→ tutorials), "Complete Example" sections (→ tutorials/guides)
   - **Expand**: Any API methods missing from the current docs but present in source code
4. Delete the old `/docs/packages/{name}.tsx`

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
|---|---|---|---|---|
| Content migration | Incomplete API coverage | Existing docs skip methods that exist in source | Users can't find reference for real API methods | Cross-reference against `packages/{name}/src/` for each page |
| Old URL breakage | External links to `/docs/packages/*` 404 | Deleting old route files | Broken bookmarks and external links | Accept this for now — the site is pre-launch. If needed later, add redirect routes |
| AI reference | Anthropic claims persist | Copy-pasting from old ai.tsx without fixing | Contradicts Phase 1 fixes | Phase 1 fixes ai.tsx before this phase runs; reference page is written fresh, not copied |

## Validation Commands

```bash
# Type checking
cd apps/site && bunx tsc --noEmit

# Dev server
cd apps/site && bun run dev

# Verify no old package routes remain
ls apps/site/src/routes/docs/packages/  # Should be empty or not exist

# Verify all 12 reference pages exist
ls apps/site/src/routes/docs/reference/  # Should show 12 .tsx files + index.tsx

# Verify no Anthropic references
grep -ri "anthropic" apps/site/src/routes/docs/reference/
```

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
