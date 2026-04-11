# Spec: Phase 3 — Content Accuracy Audit

**Contract**: [`contract.md`](./contract.md)
**Effort**: M (1–2 days with parallel agents)
**Blocked by**: Phase 2
**Parallel with**: Phase 4, Phase 5 (can start as soon as Phase 2 is done)

## Overview

Every documentation page must accurately reflect the actual Roost source code. After the Phase 2 migration, the content is structurally correct MDX but may contain stale API signatures, incorrect class names, non-existent methods, or outdated code examples — copied verbatim from the original TSX files, which were hand-authored and may have drifted from the implementation.

This phase cross-references each package's exported API against the docs that describe it, identifies every discrepancy, and applies fixes. The output is accurate documentation that an LLM can trust when generating Roost code.

## Audit Approach

For each package, an agent performs a four-step loop:

1. **Read exports**: Parse `packages/{pkg}/src/index.ts` to get the real public API — class names, function names, method signatures, parameter types, return types.
2. **Read all docs**: Find every `.mdx` file in `content/docs/` that mentions this package (reference page, guide, concept page, any tutorials).
3. **Diff**: Compare what the docs claim is available against what the source exports. Flag every discrepancy.
4. **Fix**: Edit the `.mdx` files to correct every flagged issue. Update code examples to match real signatures.

At the end, each agent writes a `FIXES-{pkg}.md` summary listing what was wrong and what was changed. These summaries are collected into a top-level `FIXES.md` in `apps/site/content/`.

## Parallel Agent Strategy

One agent per package. 12 agents run in parallel — each is fully independent because packages don't share doc files in a conflicting way (a tutorial that mentions multiple packages will be audited by whichever agent processes the most prominent package on that page; the second agent may audit the same file but for different content, which is acceptable).

| Agent | Package | Key docs to audit |
|-------|---------|------------------|
| Agent 1 | `@roost/orm` | `reference/orm.mdx`, `guides/database.mdx`, `guides/models.mdx`, `guides/migrations.mdx`, `concepts/packages/orm.mdx`, any tutorial using DB |
| Agent 2 | `@roost/router` | `reference/router.mdx`, `guides/routing.mdx`, `guides/middleware.mdx` (routing aspects), `concepts/packages/router.mdx` |
| Agent 3 | `@roost/middleware` | `reference/middleware.mdx`, `guides/middleware.mdx`, `concepts/packages/middleware.mdx` |
| Agent 4 | `@roost/auth` | `reference/auth.mdx`, `guides/authentication.mdx`, `guides/authorization.mdx`, `tutorials/add-authentication.mdx`, `concepts/packages/auth.mdx` |
| Agent 5 | `@roost/queue` | `reference/queue.mdx`, `guides/queues.mdx`, `concepts/packages/queue.mdx` |
| Agent 6 | `@roost/jobs` | `reference/jobs.mdx`, `guides/jobs.mdx`, `tutorials/build-a-background-job.mdx`, `concepts/packages/jobs.mdx` |
| Agent 7 | `@roost/agents` | `reference/agents.mdx`, `guides/ai-agents.mdx`, `concepts/packages/agents.mdx` |
| Agent 8 | `@roost/tools` | `reference/tools.mdx`, `guides/tools.mdx`, `guides/mcp-servers.mdx`, `concepts/packages/tools.mdx` |
| Agent 9 | `@roost/storage` | `reference/storage.mdx`, `guides/storage.mdx`, `concepts/packages/storage.mdx` |
| Agent 10 | `@roost/cache` | `reference/cache.mdx`, `guides/caching.mdx`, `concepts/packages/cache.mdx` |
| Agent 11 | `@roost/config` | `reference/config.mdx`, `guides/configuration.mdx`, `concepts/packages/config.mdx` |
| Agent 12 | `@roost/cli` | `reference/cli.mdx`, `getting-started.mdx`, any tutorial that uses CLI commands |

## Known Issue: Migrations Guide

The `guides/migrations.mdx` page (Agent 1) is the most likely source of significant inaccuracy. The contract explicitly calls out that this guide uses raw SQL as the primary API when the framework provides a schema builder. The fix pattern:

**Before** (incorrect primary pattern):

```ts
// Raw SQL migration
await db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL
  )
`)
```

**After** (correct: schema builder as primary, raw SQL as escape hatch):

```ts
// Schema builder migration (preferred)
export async function up(schema: Schema) {
  await schema.createTable('users', (table) => {
    table.id()
    table.string('email').notNull()
    table.timestamps()
  })
}

export async function down(schema: Schema) {
  await schema.dropTable('users')
}
```

With a note:

```mdx
:::tip Raw SQL escape hatch
If the schema builder does not support a specific database operation, use `schema.raw()`:

```ts
await schema.raw('CREATE INDEX CONCURRENTLY ...')
```
:::
```

## Audit Checklist Per Package

Each agent works through this checklist:

- [ ] Read `packages/{pkg}/src/index.ts` — list all exported names
- [ ] Read `packages/{pkg}/src/` (other files) if index re-exports from subdirectories
- [ ] Check reference doc: does every exported class/function have a section? Are any documented that don't exist?
- [ ] Check method signatures: parameter names, types, optional vs required, return type
- [ ] Check code examples: do they compile against the real API? (Read the type definitions to verify)
- [ ] Check guide: does it use the preferred API patterns? Does it use the right import paths?
- [ ] Check concepts page: is the description of what the package does accurate?
- [ ] Check any tutorials: do the step-by-step instructions match the real CLI commands and API?
- [ ] Check import paths: `import { X } from '@roost/{pkg}'` — is `X` actually exported from that path?

## Output Format

Each agent produces a `FIXES-{pkg}.md` at `apps/site/content/` with this structure:

```markdown
# Audit: @roost/{pkg}

## Status: {CLEAN | FIXED | NEEDS-REVIEW}

## Exports verified
List of real exports found in source.

## Discrepancies found and fixed
| File | Issue | Fix applied |
|------|-------|-------------|
| `guides/migrations.mdx` | Uses raw SQL as primary pattern | Rewrote to use schema builder; raw SQL moved to callout |
| `reference/orm.mdx` | `find()` documented as returning `T` but actually returns `T | null` | Updated return type |

## Files modified
- `content/docs/guides/migrations.mdx`
- `content/docs/reference/orm.mdx`

## Items requiring human review
Any ambiguity or judgment calls that should be reviewed before shipping.
```

## Acceptance Criteria

- [ ] All 12 `FIXES-{pkg}.md` files written to `apps/site/content/`
- [ ] `bun run --filter roost-site typecheck` passes after all fixes applied
- [ ] `bun run --filter roost-site build` passes
- [ ] Migrations guide uses schema builder as primary API
- [ ] No documentation page references a class, method, or parameter that does not exist in the source
- [ ] All import paths in code examples match the actual package exports

## Validation Commands

```bash
# After all agents complete:
bun run --filter roost-site typecheck
bun run --filter roost-site build

# Verify FIXES files were written
ls apps/site/content/FIXES-*.md

# Spot-check: search for raw SQL patterns in migrations doc
grep -n "db.exec" apps/site/content/docs/guides/migrations.mdx
```
