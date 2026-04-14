# Implementation Spec: Roost Diataxis Docs — Phase 3 (How-to Guides)

**Contract**: ./contract.md
**Estimated Effort**: L

## Technical Approach

Phase 3 creates task-oriented how-to guides for all 12 packages plus cross-cutting guides that span multiple packages. These are *not* tutorials — they assume the reader is a competent Roost developer who wants to accomplish a specific goal. Each guide answers "how do I do X?" without teaching fundamentals.

Inspired by Laravel 13's "The Basics" and "Digging Deeper" sections, which are essentially how-to guides organized by topic. Roost guides are organized by package but also include cross-cutting guides for workflows that span packages (e.g., "How to add authentication to routes" touches auth + core middleware).

**How-to guide rules (Diataxis)**:
- Title names the goal: "How to X" or "Configuring X"
- Assumes competence — no hand-holding, no explaining what things are
- Focused on the goal — no tangents into architecture or history
- Flexible — acknowledges real-world variation and edge cases
- Links to reference for API details, links to concepts for "why" questions

## Feedback Strategy

**Inner-loop command**: `cd apps/site && bun run dev`

**Playground**: Dev server — verify guide pages render, navigation works, code examples display correctly.

**Why this approach**: Content pages need visual verification for rendering and navigation.

## File Changes

### New Files

**Per-package guide pages** (one per package):

| File Path | Purpose |
|-----------|---------|
| `apps/site/src/routes/docs/guides/core.tsx` | Guides for @roostjs/core |
| `apps/site/src/routes/docs/guides/cloudflare.tsx` | Guides for @roostjs/cloudflare |
| `apps/site/src/routes/docs/guides/start.tsx` | Guides for @roostjs/start |
| `apps/site/src/routes/docs/guides/auth.tsx` | Guides for @roostjs/auth |
| `apps/site/src/routes/docs/guides/orm.tsx` | Guides for @roostjs/orm |
| `apps/site/src/routes/docs/guides/ai.tsx` | Guides for @roostjs/ai |
| `apps/site/src/routes/docs/guides/mcp.tsx` | Guides for @roostjs/mcp |
| `apps/site/src/routes/docs/guides/billing.tsx` | Guides for @roostjs/billing |
| `apps/site/src/routes/docs/guides/queue.tsx` | Guides for @roostjs/queue |
| `apps/site/src/routes/docs/guides/cli.tsx` | Guides for @roostjs/cli |
| `apps/site/src/routes/docs/guides/testing.tsx` | Guides for @roostjs/testing |
| `apps/site/src/routes/docs/guides/schema.tsx` | Guides for @roostjs/schema |

**Cross-cutting guide pages**:

| File Path | Purpose |
|-----------|---------|
| `apps/site/src/routes/docs/guides/migrations.tsx` | Database migrations and schema management |
| `apps/site/src/routes/docs/guides/deployment.tsx` | Deploying to Cloudflare Workers |
| `apps/site/src/routes/docs/guides/environment.tsx` | Managing env vars and secrets across environments |
| `apps/site/src/routes/docs/guides/error-handling.tsx` | Error handling patterns across the stack |

### Modified Files

| File Path | Changes |
|-----------|---------|
| `apps/site/src/components/doc-layout.tsx` | Add guide links under "Guides" sidebar section |
| `apps/site/src/components/search.tsx` | Add guide page entries to search index |
| `apps/site/src/routes/docs/guides/index.tsx` | Update landing page with links to all guide pages |

## Implementation Details

### Guide Page Structure (Template)

**Pattern to follow**: Existing package pages in `apps/site/src/routes/docs/packages/*.tsx`

Every guide page uses `DocLayout` and contains multiple named guides as `<h2>` sections:

```tsx
function Page() {
  return (
    <DocLayout title="@roostjs/{package} Guides" subtitle="Task-oriented instructions for {package description}">
      <h2>How to {Task 1}</h2>
      <p>{Brief context — 1 sentence max}</p>
      <h3>Steps</h3>
      {/* Numbered steps with CodeBlock examples */}
      <h3>Variations</h3>
      {/* Edge cases, alternative approaches */}

      <h2>How to {Task 2}</h2>
      {/* Same pattern */}
    </DocLayout>
  );
}
```

### Per-Package Guide Topics

The following lists the specific guides to write for each package. Each `<h2>` is a separate guide. Source content from existing docs where applicable, but rewrite as task-focused instructions without teaching.

**@roostjs/core**
- How to register a service provider
- How to configure dependency injection bindings
- How to create custom middleware
- How to access configuration values
- How to build a middleware pipeline

**@roostjs/cloudflare**
- How to configure Cloudflare bindings in wrangler.jsonc
- How to use D1 for database queries
- How to store and retrieve files with R2
- How to use KV for caching
- How to send messages to a Queue
- How to use Workers AI (the `AIClient`)
- How to configure Vectorize for embeddings

**@roostjs/start**
- How to create a new route
- How to use server functions
- How to access the Roost container from routes
- How to configure SSR

**@roostjs/auth**
- How to protect routes with authentication
- How to check user roles and permissions
- How to implement multi-tenancy with organizations
- How to manage sessions
- How to handle the OAuth callback
- How to add CSRF protection

**@roostjs/orm**
- How to define a model
- How to write and run migrations
- How to query with the QueryBuilder
- How to define relationships between models
- How to use lifecycle hooks
- How to seed the database
- How to use factories in tests
- How to paginate query results

**@roostjs/ai**
- How to create an AI agent
- How to define and register tools
- How to configure the model and parameters
- How to stream agent responses
- How to manage conversation memory
- How to test agents without calling the AI provider

**@roostjs/mcp**
- How to create an MCP server
- How to define MCP tools
- How to expose resources via MCP
- How to define MCP prompts

**@roostjs/billing**
- How to configure Stripe credentials
- How to create a customer and subscription
- How to handle Stripe webhooks
- How to gate routes by subscription status
- How to implement metered billing

**@roostjs/queue**
- How to define a background job
- How to dispatch jobs
- How to chain and batch jobs
- How to handle job failures and retries
- How to test jobs without dispatching

**@roostjs/cli**
- How to scaffold a new project
- How to generate models, controllers, and other code
- How to run and rollback migrations
- How to deploy your application

**@roostjs/testing**
- How to write HTTP tests with TestClient
- How to assert on responses
- How to use fakes for unit testing
- How to test with a fresh database

**@roostjs/schema**
- How to define a tool input schema
- How to use optional and nested schemas
- How to add descriptions to schema fields

### Cross-Cutting Guides

**Migrations** (`guides/migrations.tsx`):
- How to create a migration
- How to run pending migrations
- How to rollback migrations
- How to reset and re-run all migrations (`migrate:fresh`)
- How to define columns (string, integer, boolean, json, timestamps, etc.)
- How to add indexes and foreign keys
- Mirrors Laravel's dedicated migrations docs page

**Deployment** (`guides/deployment.tsx`):
- How to deploy with `roost deploy`
- How to set production environment variables in Cloudflare dashboard
- How to configure custom domains
- How to set up preview deployments

**Environment** (`guides/environment.tsx`):
- How to manage `.dev.vars` for local development
- How to set secrets in Cloudflare dashboard for production
- How to access env vars via the config manager
- How to use different configs per environment

**Error Handling** (`guides/error-handling.tsx`):
- How to handle errors in routes
- How to handle errors in background jobs
- How to log errors
- How to create custom error responses

### Sidebar and Search

**Implementation steps**:
1. Add all guide links to the "Guides" sidebar section in `doc-layout.tsx`, grouped as:
   - Cross-cutting (Migrations, Deployment, Environment, Error Handling)
   - Core (core, cloudflare, start)
   - Features (auth, orm, ai, mcp, billing, queue)
   - Tooling (cli, testing, schema)
2. Add all guide pages and their `<h2>` sections to the search index
3. Update the guides landing page with categorized links

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
|---|---|---|---|---|
| Guide content | Drifts into tutorial territory | Writer adds too much context/explanation | Fails Diataxis test — confuses competent users | Self-check: "Does this help a competent user accomplish a specific goal without teaching?" If not, move content to tutorials or concepts |
| Guide content | Duplicates reference | Guide restates API signatures instead of just showing usage | Bloat and maintenance burden | Link to reference instead: "See [Agent API reference](/docs/reference/ai) for full method signatures" |
| Cross-cutting guides | Orphaned from packages | Cross-cutting guides don't link back to package guides/reference | Users miss related content | Include "Related" links at bottom of each cross-cutting guide |

## Validation Commands

```bash
# Type checking
cd apps/site && bunx tsc --noEmit

# Dev server
cd apps/site && bun run dev

# Verify all guide files exist
ls apps/site/src/routes/docs/guides/

# Count guide files (should be 16: 12 packages + 4 cross-cutting + 1 index)
ls apps/site/src/routes/docs/guides/*.tsx | wc -l
```

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
