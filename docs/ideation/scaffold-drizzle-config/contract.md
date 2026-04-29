# Scaffold Drizzle Config Contract

**Created**: 2026-04-29
**Confidence Score**: 95/100
**Status**: Approved
**Supersedes**: None

## Problem Statement

`roost migrate` and `roost migrate:generate` are documented commands (`apps/site/content/docs/reference/cli.mdx:61`, `packages/cli/README.md:71-72`) that shell out to `bunx drizzle-kit push` and `bunx drizzle-kit generate` respectively (`packages/cli/src/index.ts:127,131`). drizzle-kit relies on a `drizzle.config.ts` at the project root to know what dialect to target, where the schema lives, and where to write migrations.

The CLI's `roost new` scaffolder (`packages/cli/src/commands/new.ts`) writes `package.json`, `tsconfig.json`, `vite.config.ts`, `wrangler.jsonc`, `.gitignore`, `.dev.vars`, three `src/` files, and three `config/` files — but it **does not write** `drizzle.config.ts`, `database/schema.ts`, `database/migrations/`, or `database/seeders/`. The reference docs claim those files exist (`docs/reference/cli.mdx:50-63`), but reality contradicts the docs.

Result: a developer running `roost new my-app && cd my-app && bun install && roost migrate` gets a confusing drizzle-kit error about a missing config, not a clear "you need to set up drizzle.config.ts" message. The first-run experience is broken for the migration command.

## Goals

1. `roost new <name>` produces a project where `roost migrate:generate` runs without configuration errors (it may still need a real D1 binding, but it must not fail because `drizzle.config.ts` is missing).
2. The scaffolded project layout matches what `apps/site/content/docs/reference/cli.mdx` already documents — no docs change required.
3. The new scaffolded files use the dialect (`sqlite`), driver (`d1-http`), and binding name (`DB`) that match the rest of the scaffold (`config/database.ts` → `d1Binding: 'DB'`).
4. A unit test verifies the `new` command writes the new files with the expected shape, following the existing test pattern in `packages/cli/__tests__/generators.test.ts`.
5. The change ships on a feature branch via a pull request with an explanatory body.

## Success Criteria

- [ ] `roost new foo` creates `foo/drizzle.config.ts` with `dialect: 'sqlite'`, `driver: 'd1-http'`, `schema: './database/schema.ts'`, `out: './database/migrations'`, and a `dbCredentials` block keyed off env vars (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, `CLOUDFLARE_D1_TOKEN`).
- [ ] `roost new foo` creates `foo/database/schema.ts` as an empty barrel with a top comment instructing the user to declare `sqliteTable(...)` exports here.
- [ ] `roost new foo` creates `foo/database/migrations/.gitkeep` and `foo/database/seeders/.gitkeep` so the directories exist in git.
- [ ] `roost new foo` writes `foo/wrangler.jsonc` with a commented-out `d1_databases` block referencing binding `DB`, plus an inline comment pointing to `wrangler d1 create`.
- [ ] In `foo/`, running `bunx drizzle-kit generate` against an empty schema produces no error related to missing config (it may legitimately exit because there are no tables to generate from — that's fine; missing-config errors are not).
- [ ] A new test in `packages/cli/__tests__/generators.test.ts` (or a sibling file) covers the `newCommand` and asserts the four new files exist with the expected substrings.
- [ ] The change lands on branch `feat/scaffold-drizzle-config` and is shipped via `gh pr create` with summary and test plan.

## Scope Boundaries

### In Scope

- Editing `packages/cli/src/commands/new.ts` to write `drizzle.config.ts`, `database/schema.ts`, `database/migrations/.gitkeep`, `database/seeders/.gitkeep`, and to add a commented `d1_databases` block to the existing `wrangler.jsonc` template literal.
- Adding a unit test for the `new` command following the `mkdtemp` + `process.chdir` pattern from `generators.test.ts`.
- Creating branch `feat/scaffold-drizzle-config`, committing, opening PR via `gh`.

### Out of Scope

- Changing how `roost migrate` invokes drizzle-kit (`packages/cli/src/index.ts`) — the wrapper stays as-is.
- Modifying `roost make:model` to auto-populate `database/schema.ts` — addresses the Model-class-vs-sqliteTable architectural tension, separate concern.
- Updating any docs in `apps/site/content/` — current docs already describe the target state correctly.
- Bumping `drizzle-kit` or `drizzle-orm` versions in `packages/cli/src/scaffold/stack.ts`.
- Generating a sample model or migration to populate the schema.

### Future Considerations

- `roost make:model <Name>` could append a `sqliteTable` declaration to `database/schema.ts` so models and drizzle-kit stay in sync. This requires a separate design decision about whether `Model.columns` and `sqliteTable(...)` should be the same source of truth or remain dual.
- A `roost db:create` command that runs `wrangler d1 create` and patches the active stub into `wrangler.jsonc`.
- An end-to-end test that actually runs `bunx drizzle-kit generate` in the scaffolded project (currently blocked because the test harness has no D1 environment).

## Execution Plan

_Single phase, single PR, sequential execution._

### Dependency Graph

```
Phase 1: Scaffold drizzle config + database/ skeleton + test + PR
```

### Execution Steps

**Strategy**: Sequential

1. **Phase 1** — Scaffold drizzle config and ship PR _(only phase)_
   ```bash
   /execute-spec docs/ideation/scaffold-drizzle-config/spec.md
   ```

---

_Contract approved by author at confidence 95/100. Ready for implementation._
