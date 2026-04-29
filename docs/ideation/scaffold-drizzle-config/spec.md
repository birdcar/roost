# Implementation Spec: Scaffold Drizzle Config

**Contract**: ./contract.md
**Estimated Effort**: S

## Technical Approach

Extend `packages/cli/src/commands/new.ts` to write four additional artifacts during `roost new <name>`: a `drizzle.config.ts` at the project root, an empty `database/schema.ts` barrel, and `.gitkeep` files inside `database/migrations/` and `database/seeders/`. Also patch the existing `wrangler.jsonc` template literal in the same file to include a commented-out `d1_databases` block keyed to the same `DB` binding name that `config/database.ts` already references.

The implementation pattern is identical to every other `await writeFile(join(dir, ...), ...)` call already in `new.ts`. No new abstractions, no helper extraction — the scaffolder is intentionally a flat sequence of file writes, and we follow that style.

A unit test is added to `packages/cli/__tests__/` exercising `newCommand` end-to-end against a temp directory, asserting the new files exist and contain the expected pinned strings (dialect, schema path, binding name). Test pattern mirrors `generators.test.ts` exactly: `mkdtemp`, `process.chdir`, run command, read file, `expect(content).toContain(...)`. The work ships on branch `feat/scaffold-drizzle-config` via a PR.

## Feedback Strategy

**Inner-loop command**: `bun test packages/cli/__tests__/generators.test.ts`

**Playground**: Test suite. The new test exercises the full `newCommand` against a temp dir.

**Why this approach**: All four scaffolded artifacts are pure file writes — there's nothing to "view" interactively. A focused unit test that asserts file existence and pinned string content is the tightest possible loop. End-to-end "does drizzle-kit actually accept this config" requires Cloudflare D1 credentials and is out of scope (acknowledged in the contract's success criteria).

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `docs/ideation/scaffold-drizzle-config/contract.md` | Already written during ideation. Reference only. |
| `docs/ideation/scaffold-drizzle-config/spec.md` | This file. Reference only. |
| `packages/cli/__tests__/new-command.test.ts` | New test file covering `newCommand`'s scaffold output. |

### Modified Files

| File Path | Changes |
| --- | --- |
| `packages/cli/src/commands/new.ts` | Add four `writeFile` calls (drizzle.config.ts, database/schema.ts, database/migrations/.gitkeep, database/seeders/.gitkeep). Modify existing `wrangler.jsonc` template literal to add a commented `d1_databases` block. |

### Deleted Files

None.

## Implementation Details

### 1. drizzle.config.ts scaffold

**Pattern to follow**: `packages/cli/src/commands/new.ts:103-117` (the existing `wrangler.jsonc` write).

**Overview**: Static file content with the project's chosen dialect/driver/paths. No interpolation needed beyond standard backtick template.

**Content to write at `<dir>/drizzle.config.ts`**:

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  driver: 'd1-http',
  schema: './database/schema.ts',
  out: './database/migrations',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_DATABASE_ID!,
    token: process.env.CLOUDFLARE_D1_TOKEN!,
  },
});
```

**Key decisions**:

- `driver: 'd1-http'` — matches Cloudflare's recommended drizzle-kit setup for D1 production migrations. Local-only iteration via `wrangler d1 execute --local` is a separate flow we don't block on.
- Three env vars (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, `CLOUDFLARE_D1_TOKEN`) are documented Cloudflare standards. Use of `!` non-null assertion is intentional in scaffold code — drizzle-kit itself surfaces a clear error if any are missing.
- Binding name `DB` is implicit (drizzle.config.ts doesn't reference it directly; `wrangler.jsonc`'s d1_databases entry does). Keeping that single source of truth in `config/database.ts` and `wrangler.jsonc`.

**Implementation steps**:

1. Locate the block in `new.ts` after the `wrangler.jsonc` write (line ~117) and before the `.gitignore` write (line ~119).
2. Add `await writeFile(join(dir, 'drizzle.config.ts'), ...)` with the content above.

### 2. database/schema.ts barrel

**Pattern to follow**: `packages/cli/src/commands/new.ts:193-203` (existing `config/app.ts` and `config/database.ts` writes).

**Content**:

```typescript
// Declare your Drizzle table schemas here for drizzle-kit to discover them.
// Example:
//   import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
//   export const users = sqliteTable('users', {
//     id: integer('id').primaryKey({ autoIncrement: true }),
//     email: text('email').notNull().unique(),
//   });

export {};
```

**Key decisions**:

- `export {}` makes this a TypeScript module so `import` statements added later don't trip on "not a module" errors.
- The example is in a comment, not active code, to keep the file truly empty by default. Per the contract, we explicitly chose not to ship example code.
- A note about the Model-class-vs-sqliteTable tension is intentionally omitted from the file itself — that's a docs concern, not a scaffold concern.

**Implementation steps**:

1. After the drizzle.config.ts write, add a `mkdir` for `<dir>/database` (recursive — though `writeFile` won't create intermediate dirs).
2. Write `database/schema.ts` with the content above.

### 3. database/migrations/.gitkeep and database/seeders/.gitkeep

**Pattern to follow**: There's no existing `.gitkeep` in `new.ts`. Use plain `writeFile` with empty string content after `mkdir(... { recursive: true })`.

**Content**: Empty string for both.

**Key decisions**:

- `.gitkeep` is the conventional empty placeholder. Drizzle-kit will write actual migration SQL into `database/migrations/` on the user's first `migrate:generate` invocation.
- Both directories must exist on disk before drizzle-kit runs (drizzle-kit creates `out` if missing, but `seeders/` is purely for the user).

**Implementation steps**:

1. `await mkdir(join(dir, 'database', 'migrations'), { recursive: true })`.
2. `await writeFile(join(dir, 'database', 'migrations', '.gitkeep'), '')`.
3. `await mkdir(join(dir, 'database', 'seeders'), { recursive: true })`.
4. `await writeFile(join(dir, 'database', 'seeders', '.gitkeep'), '')`.

### 4. Modify wrangler.jsonc template

**Location**: `packages/cli/src/commands/new.ts:103-117`.

**Current content** (already in file):

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "${kebab}",
  "compatibility_date": "${compatDate}",
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry",
  "observability": { "enabled": true },
  "limits": { "cpu_ms": 50 },
  "placement": { "mode": "smart" }

  // Gradual rollout: deploy with `wrangler deploy --x-versions` to enable version management.
  // Use `wrangler deployments list` to see active versions and traffic splits.
  // Use `wrangler rollback` to instantly revert a bad deploy.
}
```

**New content**: Same as above, plus a commented-out `d1_databases` array. The existing rollout comment stays. Add before the rollout comment block:

```jsonc
  // Database: uncomment after running `wrangler d1 create <name>` and paste the database_id below.
  // "d1_databases": [
  //   {
  //     "binding": "DB",
  //     "database_name": "${kebab}",
  //     "database_id": "<paste from wrangler d1 create>"
  //   }
  // ],
```

**Key decisions**:

- Commented out (per contract): keeps `wrangler dev` working on a fresh scaffold without forcing the user to run `d1 create` immediately. Active stub with placeholder ID would break dev startup.
- `binding: "DB"` matches `config/database.ts`'s `d1Binding: 'DB'` — single source of truth.
- `database_name` is the project name in kebab-case to give the user a sensible default when they uncomment.

**Implementation steps**:

1. Edit the template string literal in `new.ts` to insert the comment block above the existing "Gradual rollout" comment.

### 5. Test: `new-command.test.ts`

**Pattern to follow**: `packages/cli/__tests__/generators.test.ts:15-30` (the `makeModel creates model file` test).

**Overview**: Run `newCommand('test-app')` in a temp directory, then assert each new file exists and contains expected substrings. Network is not exercised — `newCommand` writes a `package.json` referencing `@roostjs/*` but the test does not run `bun install`.

```typescript
import { describe, test, expect, afterEach } from 'bun:test';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { newCommand } from '../src/commands/new';

let tempDir: string;

describe('newCommand scaffold', () => {
  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  test('writes drizzle.config.ts at project root with d1-http driver', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-new-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);
    try {
      await newCommand('test-app', {});
      const content = await readFile(join(tempDir, 'test-app', 'drizzle.config.ts'), 'utf-8');
      expect(content).toContain("dialect: 'sqlite'");
      expect(content).toContain("driver: 'd1-http'");
      expect(content).toContain("schema: './database/schema.ts'");
      expect(content).toContain("out: './database/migrations'");
      expect(content).toContain('CLOUDFLARE_DATABASE_ID');
    } finally {
      process.chdir(origCwd);
    }
  });

  test('writes database/schema.ts as an empty module barrel', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-new-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);
    try {
      await newCommand('test-app', {});
      const content = await readFile(join(tempDir, 'test-app', 'database', 'schema.ts'), 'utf-8');
      expect(content).toContain('export {}');
      expect(content).toContain('drizzle-kit');
    } finally {
      process.chdir(origCwd);
    }
  });

  test('creates database/migrations and database/seeders with .gitkeep', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-new-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);
    try {
      await newCommand('test-app', {});
      const migrationsKeep = await stat(join(tempDir, 'test-app', 'database', 'migrations', '.gitkeep'));
      const seedersKeep = await stat(join(tempDir, 'test-app', 'database', 'seeders', '.gitkeep'));
      expect(migrationsKeep.isFile()).toBe(true);
      expect(seedersKeep.isFile()).toBe(true);
    } finally {
      process.chdir(origCwd);
    }
  });

  test('wrangler.jsonc includes a commented d1_databases block bound to DB', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'roost-new-test-'));
    const origCwd = process.cwd();
    process.chdir(tempDir);
    try {
      await newCommand('test-app', {});
      const content = await readFile(join(tempDir, 'test-app', 'wrangler.jsonc'), 'utf-8');
      expect(content).toContain('// "d1_databases"');
      expect(content).toContain('"binding": "DB"');
      expect(content).toContain('test-app');
    } finally {
      process.chdir(origCwd);
    }
  });
});
```

**Key test cases**:

- Each new file is created with expected pinned strings.
- `.gitkeep` files exist (using `stat`, not `readFile` — content is empty).
- `wrangler.jsonc` contains the commented binding (assertion on `// "d1_databases"` confirms it's commented, not active).

**Note on `newCommand` signature**: Verify the function name and signature in `packages/cli/src/commands/new.ts`. Existing call site in `index.ts` shows it accepts a project name and an options object. If the export name differs, update the import.

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `packages/cli/__tests__/new-command.test.ts` | All four scaffold artifacts; pinned-string assertions. |

### Manual Testing

- [ ] Run `bun run packages/cli/src/index.ts new tmp-scaffold-check` (or equivalent) in a sandbox directory and visually confirm the four new files appear at the expected paths.
- [ ] Open the generated `drizzle.config.ts` in an editor and confirm it has no TypeScript errors when the project's `bun install` has been run.
- [ ] Run `bunx drizzle-kit generate` inside the scaffolded project — it should not error about a missing config (it will likely report "no schema changes" because `schema.ts` is empty; that's the desired pass condition).

## Error Handling

| Scenario | Strategy |
| --- | --- |
| `mkdir` fails (permissions, disk full) | Let it throw — `newCommand` already lets `writeFile` errors propagate, which is the existing behavior. No special handling. |
| Project directory already exists | Existing `--force` handling in `new.ts` already covers this. Not changed. |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| `drizzle.config.ts` template | Missing env var at drizzle-kit invocation time | User runs `roost migrate:generate` before setting `CLOUDFLARE_*` env vars | drizzle-kit throws on `process.env.X!` | Acknowledged, not handled — this is drizzle-kit's surface area, and the error is clear. The contract explicitly does not promise migrate runs end-to-end on a fresh scaffold without credentials. |
| `wrangler.jsonc` commented block | User forgets to uncomment after `wrangler d1 create` | Stub remains commented; `wrangler dev` doesn't expose `DB` binding | Runtime error when code reads `env.DB` | Comment text already says "uncomment after running `wrangler d1 create`" — surfaces the next step. |
| `database/schema.ts` | Empty barrel hides the Model-class-vs-sqliteTable mismatch | User adds models via `roost make:model`, expects them in schema | drizzle-kit sees no tables; migrations stay empty | Out of scope per contract. The comment in schema.ts directs users to add tables explicitly. |
| `.gitkeep` files | User adds real files, forgets to delete `.gitkeep` | Cosmetic only | Tiny tracked file | Acceptable — this is the standard convention. |
| Test file | `newCommand` export name or signature differs from assumption | Wrong import path | Test won't compile | Verify in the modified `new.ts` before writing test; adjust import. |

## Validation Commands

```bash
# Run the new test alone
cd /Users/birdcar/Code/birdcar/roost
bun test packages/cli/__tests__/new-command.test.ts

# Run all CLI tests (regression check)
bun test packages/cli/__tests__/

# Type check the cli package
cd packages/cli && bunx tsc --noEmit

# Optional: smoke-test the scaffolder against a tmp dir
cd /tmp && rm -rf roost-smoke && bun run /Users/birdcar/Code/birdcar/roost/packages/cli/src/index.ts new roost-smoke
ls -la roost-smoke/drizzle.config.ts roost-smoke/database/
```

## Rollout Considerations

- **Feature flag**: None. This is a scaffold output change. Existing scaffolded projects are unaffected.
- **Monitoring**: None.
- **Rollback plan**: Revert the PR. No runtime or shared-state impact.
- **Branch name**: `feat/scaffold-drizzle-config`.
- **PR title**: `feat(cli): scaffold drizzle.config.ts and database/ skeleton in roost new`.
- **PR body**: Reference the contract problem statement and link to `docs/ideation/scaffold-drizzle-config/contract.md`. Include the manual smoke-test from the Validation Commands section in the test plan.

### Branch & PR Workflow

1. From `main` (clean working tree confirmed by initial `git status`):
   ```bash
   git checkout -b feat/scaffold-drizzle-config
   ```
2. Make all code changes (modify `new.ts`, add test file). The two ideation artifacts (`contract.md`, `spec.md`) are already on `main` from the ideation step — they should be **included on this branch as part of the same PR**, per the user's "Ideation artifacts get committed" preference.

   Note: if `contract.md` and `spec.md` are written *during* this branch (rather than before branching), commit them as a single `docs(ideation):` commit before the implementation commit.
3. Run validation commands. All must pass.
4. Commit using the user's `/commit` skill convention. Two commits is fine if it makes review easier:
   - `docs(ideation): add scaffold-drizzle-config contract and spec`
   - `feat(cli): scaffold drizzle.config.ts and database/ skeleton in roost new`
5. Push the branch and open the PR:
   ```bash
   git push -u origin feat/scaffold-drizzle-config
   gh pr create --title "feat(cli): scaffold drizzle.config.ts and database/ skeleton in roost new" --body "$(cat <<'EOF'
   ## Summary
   - `roost new` now scaffolds `drizzle.config.ts`, `database/schema.ts`, `database/migrations/.gitkeep`, and `database/seeders/.gitkeep` so freshly scaffolded projects work with `roost migrate` / `roost migrate:generate` instead of failing with "missing config".
   - `wrangler.jsonc` now ships with a commented `d1_databases` block bound to `DB`, matching `config/database.ts`. The user uncomments after `wrangler d1 create`.
   - Adds a unit test for `newCommand`'s scaffold output.

   See `docs/ideation/scaffold-drizzle-config/contract.md` for the full problem statement and scope rationale.

   ## Test plan
   - [ ] `bun test packages/cli/__tests__/` passes.
   - [ ] Manual: `roost new tmp-app` produces the four new files at the expected paths.
   - [ ] Manual: `bunx drizzle-kit generate` inside the scaffolded project does not error about a missing config.
   EOF
   )"
   ```

## Open Items

- [ ] Confirm exact export name of the `new` command in `packages/cli/src/commands/new.ts` before writing the test import. (Inspect the file at implementation time.)

---

_Spec ready for implementation. Single phase, single PR, sequential execution._
