# Spec: Phase 2 — Content Migration (57 Pages)

**Contract**: [`contract.md`](./contract.md)
**Template**: [`spec-template-mdx-migration.md`](./spec-template-mdx-migration.md)
**Effort**: L (bulk — ideal for parallel agents)
**Blocked by**: Phase 1
**Parallel with**: Phase 4, Phase 5

## Overview

Migrate all 57 TSX doc route files to MDX content files. Every page follows the exact same process defined in [`spec-template-mdx-migration.md`](./spec-template-mdx-migration.md). This document lists the files grouped by section and provides agent dispatch instructions.

No new patterns are introduced here. Deviations from the template (unusual JSX, dynamic content, unusual component usage) should be resolved using the fallback rules in the template (inline JSX in MDX is valid).

## Parallel Agent Strategy

This work parallelizes cleanly by section. Each section is independent — no page in one section imports content from another. Dispatch one agent per section:

| Agent | Section | File count | Route prefix |
|-------|---------|------------|--------------|
| Agent A | Overview | 2 | `/docs/` |
| Agent B | Tutorials | 5 | `/docs/tutorials/` |
| Agent C | Guides | 17 | `/docs/guides/` |
| Agent D | Reference | 13 | `/docs/reference/` |
| Agent E | Concepts | 20 | `/docs/concepts/` |

Each agent should:
1. Read `spec-template-mdx-migration.md` fully before starting
2. Process all files in their section sequentially
3. Run `bun run --filter roost-site typecheck` after completing their section
4. Report any files that could not be cleanly migrated (unusual JSX requiring manual review)

## File List by Section

### Overview (Agent A — 2 files)

| Route file | Content file | URL |
|-----------|-------------|-----|
| `routes/docs/index.tsx` | `content/docs/index.mdx` | `/docs` |
| `routes/docs/getting-started.tsx` | `content/docs/getting-started.mdx` | `/docs/getting-started` |

### Tutorials (Agent B — 5 files)

| Route file | Content file | URL |
|-----------|-------------|-----|
| `routes/docs/tutorials/index.tsx` | `content/docs/tutorials/index.mdx` | `/docs/tutorials` |
| `routes/docs/tutorials/build-a-rest-api.tsx` | `content/docs/tutorials/build-a-rest-api.mdx` | `/docs/tutorials/build-a-rest-api` |
| `routes/docs/tutorials/build-a-background-job.tsx` | `content/docs/tutorials/build-a-background-job.mdx` | `/docs/tutorials/build-a-background-job` |
| `routes/docs/tutorials/add-authentication.tsx` | `content/docs/tutorials/add-authentication.mdx` | `/docs/tutorials/add-authentication` |
| `routes/docs/tutorials/deploy-to-cloudflare.tsx` | `content/docs/tutorials/deploy-to-cloudflare.mdx` | `/docs/tutorials/deploy-to-cloudflare` |

### Guides (Agent C — 17 files)

| Route file | Content file | URL |
|-----------|-------------|-----|
| `routes/docs/guides/index.tsx` | `content/docs/guides/index.mdx` | `/docs/guides` |
| `routes/docs/guides/routing.tsx` | `content/docs/guides/routing.mdx` | `/docs/guides/routing` |
| `routes/docs/guides/middleware.tsx` | `content/docs/guides/middleware.mdx` | `/docs/guides/middleware` |
| `routes/docs/guides/database.tsx` | `content/docs/guides/database.mdx` | `/docs/guides/database` |
| `routes/docs/guides/migrations.tsx` | `content/docs/guides/migrations.mdx` | `/docs/guides/migrations` |
| `routes/docs/guides/models.tsx` | `content/docs/guides/models.mdx` | `/docs/guides/models` |
| `routes/docs/guides/authentication.tsx` | `content/docs/guides/authentication.mdx` | `/docs/guides/authentication` |
| `routes/docs/guides/authorization.tsx` | `content/docs/guides/authorization.mdx` | `/docs/guides/authorization` |
| `routes/docs/guides/queues.tsx` | `content/docs/guides/queues.mdx` | `/docs/guides/queues` |
| `routes/docs/guides/jobs.tsx` | `content/docs/guides/jobs.mdx` | `/docs/guides/jobs` |
| `routes/docs/guides/ai-agents.tsx` | `content/docs/guides/ai-agents.mdx` | `/docs/guides/ai-agents` |
| `routes/docs/guides/tools.tsx` | `content/docs/guides/tools.mdx` | `/docs/guides/tools` |
| `routes/docs/guides/mcp-servers.tsx` | `content/docs/guides/mcp-servers.mdx` | `/docs/guides/mcp-servers` |
| `routes/docs/guides/storage.tsx` | `content/docs/guides/storage.mdx` | `/docs/guides/storage` |
| `routes/docs/guides/caching.tsx` | `content/docs/guides/caching.mdx` | `/docs/guides/caching` |
| `routes/docs/guides/configuration.tsx` | `content/docs/guides/configuration.mdx` | `/docs/guides/configuration` |
| `routes/docs/guides/testing.tsx` | `content/docs/guides/testing.mdx` | `/docs/guides/testing` |

### Reference (Agent D — 13 files)

| Route file | Content file | URL |
|-----------|-------------|-----|
| `routes/docs/reference/index.tsx` | `content/docs/reference/index.mdx` | `/docs/reference` |
| `routes/docs/reference/orm.tsx` | `content/docs/reference/orm.mdx` | `/docs/reference/orm` |
| `routes/docs/reference/router.tsx` | `content/docs/reference/router.mdx` | `/docs/reference/router` |
| `routes/docs/reference/middleware.tsx` | `content/docs/reference/middleware.mdx` | `/docs/reference/middleware` |
| `routes/docs/reference/auth.tsx` | `content/docs/reference/auth.mdx` | `/docs/reference/auth` |
| `routes/docs/reference/queue.tsx` | `content/docs/reference/queue.mdx` | `/docs/reference/queue` |
| `routes/docs/reference/jobs.tsx` | `content/docs/reference/jobs.mdx` | `/docs/reference/jobs` |
| `routes/docs/reference/agents.tsx` | `content/docs/reference/agents.mdx` | `/docs/reference/agents` |
| `routes/docs/reference/tools.tsx` | `content/docs/reference/tools.mdx` | `/docs/reference/tools` |
| `routes/docs/reference/storage.tsx` | `content/docs/reference/storage.mdx` | `/docs/reference/storage` |
| `routes/docs/reference/cache.tsx` | `content/docs/reference/cache.mdx` | `/docs/reference/cache` |
| `routes/docs/reference/config.tsx` | `content/docs/reference/config.mdx` | `/docs/reference/config` |
| `routes/docs/reference/cli.tsx` | `content/docs/reference/cli.mdx` | `/docs/reference/cli` |

### Concepts (Agent E — 20 files)

| Route file | Content file | URL |
|-----------|-------------|-----|
| `routes/docs/concepts/index.tsx` | `content/docs/concepts/index.mdx` | `/docs/concepts` |
| `routes/docs/concepts/architecture/index.tsx` | `content/docs/concepts/architecture/index.mdx` | `/docs/concepts/architecture` |
| `routes/docs/concepts/architecture/request-lifecycle.tsx` | `content/docs/concepts/architecture/request-lifecycle.mdx` | `/docs/concepts/architecture/request-lifecycle` |
| `routes/docs/concepts/architecture/workers-model.tsx` | `content/docs/concepts/architecture/workers-model.mdx` | `/docs/concepts/architecture/workers-model` |
| `routes/docs/concepts/architecture/bindings.tsx` | `content/docs/concepts/architecture/bindings.mdx` | `/docs/concepts/architecture/bindings` |
| `routes/docs/concepts/architecture/edge-first.tsx` | `content/docs/concepts/architecture/edge-first.mdx` | `/docs/concepts/architecture/edge-first` |
| `routes/docs/concepts/packages/orm.tsx` | `content/docs/concepts/packages/orm.mdx` | `/docs/concepts/packages/orm` |
| `routes/docs/concepts/packages/router.tsx` | `content/docs/concepts/packages/router.mdx` | `/docs/concepts/packages/router` |
| `routes/docs/concepts/packages/middleware.tsx` | `content/docs/concepts/packages/middleware.mdx` | `/docs/concepts/packages/middleware` |
| `routes/docs/concepts/packages/auth.tsx` | `content/docs/concepts/packages/auth.mdx` | `/docs/concepts/packages/auth` |
| `routes/docs/concepts/packages/queue.tsx` | `content/docs/concepts/packages/queue.mdx` | `/docs/concepts/packages/queue` |
| `routes/docs/concepts/packages/jobs.tsx` | `content/docs/concepts/packages/jobs.mdx` | `/docs/concepts/packages/jobs` |
| `routes/docs/concepts/packages/agents.tsx` | `content/docs/concepts/packages/agents.mdx` | `/docs/concepts/packages/agents` |
| `routes/docs/concepts/packages/tools.tsx` | `content/docs/concepts/packages/tools.mdx` | `/docs/concepts/packages/tools` |
| `routes/docs/concepts/packages/storage.tsx` | `content/docs/concepts/packages/storage.mdx` | `/docs/concepts/packages/storage` |
| `routes/docs/concepts/packages/cache.tsx` | `content/docs/concepts/packages/cache.mdx` | `/docs/concepts/packages/cache` |
| `routes/docs/concepts/packages/config.tsx` | `content/docs/concepts/packages/config.mdx` | `/docs/concepts/packages/config` |
| `routes/docs/concepts/packages/cli.tsx` | `content/docs/concepts/packages/cli.mdx` | `/docs/concepts/packages/cli` |
| `routes/docs/concepts/philosophy/conventions.tsx` | `content/docs/concepts/philosophy/conventions.mdx` | `/docs/concepts/philosophy/conventions` |
| `routes/docs/concepts/philosophy/ai-native.tsx` | `content/docs/concepts/philosophy/ai-native.mdx` | `/docs/concepts/philosophy/ai-native` |

## Acceptance Criteria

All 57 pages must meet these criteria before Phase 2 is considered complete:

- [ ] `.mdx` file exists at the correct `content/docs/` path
- [ ] `.mdx` file has valid frontmatter with `title` and `description`
- [ ] Route file is a thin wrapper — no content embedded, just frontmatter import + DocLayout
- [ ] `bun run --filter roost-site typecheck` passes with no errors
- [ ] `bun run --filter roost-site build` completes without errors
- [ ] Every page renders visually identically in the browser (spot-check 5 pages per section)
- [ ] `curl http://localhost:5173/docs/{any-path}.md` returns valid Markdown for every page

## Notes

- The 57-file count is based on the contract. If the actual route tree has additional files (e.g., `_layout.tsx`, `__root.tsx`), skip non-content route files.
- Agent C (Guides) has the most files and the most complex content — allocate extra time.
- The `migrations.tsx` guide is the most likely to have raw-SQL-heavy content. Do not fix accuracy issues during migration — flag for Phase 3.
- Index files (e.g., `guides/index.tsx`) are often overview/landing pages with mostly prose. These are quick migrations.
