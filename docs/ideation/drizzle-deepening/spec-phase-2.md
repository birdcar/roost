# Phase 2: Migration System

**Effort**: M (1-2 days)
**Blocked by**: Phase 1
**Status**: Ready to implement after Phase 1

## Problem

`roost migrate` shells out to `npx drizzle-kit push` with no `drizzle.config.ts` and no migration files. `roost migrate:generate` has the same problem. There is no migration tracking, no rollback, no status command. A fresh project cannot set up its database.

## Goal

A Laravel-style migration system backed by Drizzle. `drizzle-kit generate` creates SQL files. Our migrator applies them against D1, tracks state in a `_migrations` table, and supports rollback by batch.

## Design

The separation of concerns mirrors Laravel's `artisan`:

- `roost migrate:generate` — calls `drizzle-kit generate`, which diffs static schema against existing migrations and writes a new `.sql` file to `database/migrations/`
- `roost migrate` — reads `database/migrations/`, applies unapplied files in order, records each in `_migrations`
- `roost migrate:rollback` — reverts the last batch of applied migrations
- `roost migrate:status` — lists all migration files with their applied/pending status

The migrator is the source of truth for what's been applied. `drizzle-kit` is only used for schema diffing and SQL generation.

## Files Changed

| File | Change |
|------|--------|
| `packages/orm/src/migrator.ts` | New file — migration runner for use inside Workers |
| `packages/orm/src/index.ts` | Export `Migrator` |
| `packages/cli/src/commands/migrate.ts` | New file — CLI migrate command implementations |
| `packages/cli/src/index.ts` | Replace broken `migrate`/`migrate:generate` stubs; add `migrate:rollback`, `migrate:status` |
| `packages/cli/src/commands/new.ts` | Add `.gitkeep` to `database/migrations/` scaffold |

## Implementation

### Step 1 — Create `packages/orm/src/migrator.ts`

This class is used inside Workers (e.g. as a boot hook) to apply pending migrations against D1 at runtime:

```ts
import type { D1Database } from '@cloudflare/workers-types';

const MIGRATIONS_TABLE = '_migrations';

interface MigrationRecord {
  id: number;
  name: string;
  batch: number;
  applied_at: string;
}

export class Migrator {
  constructor(private d1: D1Database, private migrationsDir: string = 'database/migrations') {}

  async run(): Promise<{ applied: string[]; skipped: string[] }> {
    await this.ensureMigrationsTable();
    const pending = await this.getPendingMigrations();
    if (pending.length === 0) return { applied: [], skipped: [] };

    const batch = await this.nextBatchNumber();
    const applied: string[] = [];

    for (const file of pending) {
      const sql = await Bun.file(`${this.migrationsDir}/${file}`).text();
      await this.d1.exec(sql);
      await this.d1
        .prepare(`INSERT INTO ${MIGRATIONS_TABLE} (name, batch, applied_at) VALUES (?, ?, ?)`)
        .bind(file, batch, new Date().toISOString())
        .run();
      applied.push(file);
    }

    return { applied, skipped: [] };
  }

  async rollback(): Promise<{ reverted: string[] }> {
    await this.ensureMigrationsTable();
    const lastBatch = await this.lastBatchNumber();
    if (lastBatch === 0) return { reverted: [] };

    const rows = await this.d1
      .prepare(`SELECT name FROM ${MIGRATIONS_TABLE} WHERE batch = ? ORDER BY id DESC`)
      .bind(lastBatch)
      .all<Pick<MigrationRecord, 'name'>>();

    const reverted: string[] = [];

    for (const row of rows.results) {
      const downFile = row.name.replace(/\.sql$/, '.down.sql');
      const downPath = `${this.migrationsDir}/${downFile}`;

      try {
        const sql = await Bun.file(downPath).text();
        await this.d1.exec(sql);
      } catch {
        throw new Error(
          `Rollback failed: no down migration found at ${downPath}. ` +
          'drizzle-kit does not generate down migrations — write them manually.'
        );
      }

      await this.d1
        .prepare(`DELETE FROM ${MIGRATIONS_TABLE} WHERE name = ?`)
        .bind(row.name)
        .run();

      reverted.push(row.name);
    }

    return { reverted };
  }

  async status(): Promise<Array<{ name: string; status: 'applied' | 'pending'; batch?: number; applied_at?: string }>> {
    await this.ensureMigrationsTable();
    const allFiles = await this.getMigrationFiles();
    const applied = await this.getAppliedMigrations();
    const appliedMap = new Map(applied.map((r) => [r.name, r]));

    return allFiles.map((name) => {
      const record = appliedMap.get(name);
      if (record) {
        return { name, status: 'applied' as const, batch: record.batch, applied_at: record.applied_at };
      }
      return { name, status: 'pending' as const };
    });
  }

  private async ensureMigrationsTable(): Promise<void> {
    await this.d1.exec(`
      CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        batch INTEGER NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
  }

  private async getMigrationFiles(): Promise<string[]> {
    const glob = new Bun.Glob('*.sql');
    const files: string[] = [];
    for await (const file of glob.scan(this.migrationsDir)) {
      if (!file.endsWith('.down.sql')) files.push(file);
    }
    return files.sort();
  }

  private async getPendingMigrations(): Promise<string[]> {
    const allFiles = await this.getMigrationFiles();
    const applied = await this.getAppliedMigrations();
    const appliedNames = new Set(applied.map((r) => r.name));
    return allFiles.filter((f) => !appliedNames.has(f));
  }

  private async getAppliedMigrations(): Promise<MigrationRecord[]> {
    const rows = await this.d1
      .prepare(`SELECT id, name, batch, applied_at FROM ${MIGRATIONS_TABLE} ORDER BY id ASC`)
      .all<MigrationRecord>();
    return rows.results;
  }

  private async nextBatchNumber(): Promise<number> {
    return (await this.lastBatchNumber()) + 1;
  }

  private async lastBatchNumber(): Promise<number> {
    const row = await this.d1
      .prepare(`SELECT MAX(batch) as max_batch FROM ${MIGRATIONS_TABLE}`)
      .first<{ max_batch: number | null }>();
    return row?.max_batch ?? 0;
  }
}
```

Key decisions:
- `d1.exec()` runs raw SQL — suitable for migration files that may contain multiple statements
- `.down.sql` files are sibling files alongside `.sql` — e.g. `0001_create_users.sql` has an optional `0001_create_users.down.sql` for rollback
- drizzle-kit does not generate down migrations, so rollback throws with a helpful message unless the developer writes them manually
- `_migrations.name` has a `UNIQUE` constraint — re-running an applied migration fails loudly

### Step 2 — Export from `packages/orm/src/index.ts`

Add to the existing exports:
```ts
export { Migrator } from './migrator.js';
```

### Step 3 — Create `packages/cli/src/commands/migrate.ts`

The CLI commands use `wrangler d1 execute` to run SQL against D1. This approach avoids needing a D1 client in the CLI — wrangler handles the connection. All subprocess calls use the existing `run()` utility from `packages/cli/src/process.ts` (which uses `Bun.spawn`).

```ts
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { run } from '../process.js';

const MIGRATIONS_DIR = 'database/migrations';
const MIGRATIONS_TABLE = '_migrations';

async function getMigrationFiles(): Promise<string[]> {
  try {
    const files = await readdir(MIGRATIONS_DIR);
    return files
      .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
      .sort();
  } catch {
    return [];
  }
}

async function getD1BindingName(): Promise<string> {
  // Default — could read from config/database.ts in future
  return 'DB';
}

async function ensureMigrationsTable(dbName: string, localFlag: string[]): Promise<void> {
  await run('bunx', [
    'wrangler', 'd1', 'execute', dbName,
    '--command',
    `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, batch INTEGER NOT NULL, applied_at TEXT NOT NULL)`,
    ...localFlag,
  ]);
}

async function queryAppliedMigrations(dbName: string, localFlag: string[]): Promise<string[]> {
  const result = await run('bunx', [
    'wrangler', 'd1', 'execute', dbName,
    '--command', `SELECT name FROM ${MIGRATIONS_TABLE} ORDER BY id ASC`,
    '--json',
    ...localFlag,
  ], { silent: true });

  try {
    const parsed = JSON.parse(result.stdout) as Array<{ results: Array<{ name: string }> }>;
    return parsed[0]?.results?.map((r) => r.name) ?? [];
  } catch {
    return [];
  }
}

async function getCurrentBatch(dbName: string, localFlag: string[]): Promise<number> {
  const result = await run('bunx', [
    'wrangler', 'd1', 'execute', dbName,
    '--command', `SELECT MAX(batch) as max_batch FROM ${MIGRATIONS_TABLE}`,
    '--json',
    ...localFlag,
  ], { silent: true });

  try {
    const parsed = JSON.parse(result.stdout) as Array<{ results: Array<{ max_batch: number | null }> }>;
    return parsed[0]?.results?.[0]?.max_batch ?? 0;
  } catch {
    return 0;
  }
}

export async function runMigrate(env?: string): Promise<void> {
  const isRemote = env === 'remote';
  const localFlag = isRemote ? [] : ['--local'];
  const dbName = await getD1BindingName();

  await ensureMigrationsTable(dbName, localFlag);

  const allFiles = await getMigrationFiles();
  if (allFiles.length === 0) {
    console.log('  No migration files found in database/migrations/');
    console.log('  Run: roost migrate:generate');
    return;
  }

  const applied = await queryAppliedMigrations(dbName, localFlag);
  const appliedSet = new Set(applied);
  const pending = allFiles.filter((f) => !appliedSet.has(f));

  if (pending.length === 0) {
    console.log('  Nothing to migrate.');
    return;
  }

  const batch = (await getCurrentBatch(dbName, localFlag)) + 1;
  const now = new Date().toISOString();

  for (const file of pending) {
    console.log(`  Applying ${file}...`);
    const { exitCode } = await run('bunx', [
      'wrangler', 'd1', 'execute', dbName,
      '--file', join(MIGRATIONS_DIR, file),
      ...localFlag,
    ]);

    if (exitCode !== 0) {
      console.error(`  Failed to apply ${file}`);
      process.exit(1);
    }

    await run('bunx', [
      'wrangler', 'd1', 'execute', dbName,
      '--command',
      `INSERT INTO ${MIGRATIONS_TABLE} (name, batch, applied_at) VALUES ('${file}', ${batch}, '${now}')`,
      ...localFlag,
    ]);
  }

  console.log(`\n  Applied ${pending.length} migration(s) in batch ${batch}.`);
}

export async function runMigrateRollback(env?: string): Promise<void> {
  const isRemote = env === 'remote';
  const localFlag = isRemote ? [] : ['--local'];
  const dbName = await getD1BindingName();

  await ensureMigrationsTable(dbName, localFlag);
  const lastBatch = await getCurrentBatch(dbName, localFlag);

  if (lastBatch === 0) {
    console.log('  Nothing to rollback.');
    return;
  }

  const result = await run('bunx', [
    'wrangler', 'd1', 'execute', dbName,
    '--command', `SELECT name FROM ${MIGRATIONS_TABLE} WHERE batch = ${lastBatch} ORDER BY id DESC`,
    '--json',
    ...localFlag,
  ], { silent: true });

  const parsed = JSON.parse(result.stdout) as Array<{ results: Array<{ name: string }> }>;
  const toRevert = parsed[0]?.results?.map((r) => r.name) ?? [];

  for (const name of toRevert) {
    const downFile = name.replace(/\.sql$/, '.down.sql');
    const downPath = join(MIGRATIONS_DIR, downFile);

    const { exitCode } = await run('bunx', [
      'wrangler', 'd1', 'execute', dbName,
      '--file', downPath,
      ...localFlag,
    ]);

    if (exitCode !== 0) {
      console.error(`  Rollback failed: ${downPath} not found or execution failed.`);
      console.error('  drizzle-kit does not generate down migrations. Write them manually.');
      process.exit(1);
    }

    await run('bunx', [
      'wrangler', 'd1', 'execute', dbName,
      '--command', `DELETE FROM ${MIGRATIONS_TABLE} WHERE name = '${name}'`,
      ...localFlag,
    ]);

    console.log(`  Reverted ${name}`);
  }

  console.log(`\n  Rolled back batch ${lastBatch} (${toRevert.length} migration(s)).`);
}

export async function runMigrateStatus(env?: string): Promise<void> {
  const isRemote = env === 'remote';
  const localFlag = isRemote ? [] : ['--local'];
  const dbName = await getD1BindingName();

  await ensureMigrationsTable(dbName, localFlag);

  const allFiles = await getMigrationFiles();
  if (allFiles.length === 0) {
    console.log('  No migration files found.');
    return;
  }

  const applied = await queryAppliedMigrations(dbName, localFlag);
  const appliedSet = new Set(applied);

  console.log('\n  Migration Status\n');
  for (const file of allFiles) {
    const status = appliedSet.has(file) ? 'applied ' : 'pending ';
    console.log(`  [${status}] ${file}`);
  }
  console.log();
}
```

### Step 4 — Update `packages/cli/src/index.ts`

Replace the existing `migrate` and `migrate:generate` cases, add two new cases:

```ts
import { runMigrate, runMigrateRollback, runMigrateStatus } from './commands/migrate.js';

// ...in switch(command):

case 'migrate':
  await runMigrate(flags['remote'] ? 'remote' : undefined);
  break;

case 'migrate:generate':
  // drizzle-kit reads drizzle.config.ts, diffs schema, writes SQL to database/migrations/
  await run('bunx', ['drizzle-kit', 'generate']);
  break;

case 'migrate:rollback':
  await runMigrateRollback(flags['remote'] ? 'remote' : undefined);
  break;

case 'migrate:status':
  await runMigrateStatus(flags['remote'] ? 'remote' : undefined);
  break;
```

Update `printHelp()`:
```
    migrate               Apply pending migrations (--remote for production)
    migrate:generate      Generate migration SQL from schema diff
    migrate:rollback      Revert last migration batch (--remote for production)
    migrate:status        Show applied and pending migrations
```

### Step 5 — Add `.gitkeep` to `database/migrations/` in `roost new`

In `packages/cli/src/commands/new.ts`, after the `mkdir` for `database/migrations`:

```ts
await writeFile(join(dir, 'database', 'migrations', '.gitkeep'), '');
```

This ensures the directory is tracked in git on a fresh `roost new`.

## Validation

```bash
# In a generated project after Phase 1 (roost new my-app && cd my-app && bun install):

roost make:model User
roost migrate:generate
# Expect: database/migrations/0000_<name>.sql created

roost migrate:status
# Expect: [pending ] 0000_<name>.sql

roost migrate
# Expect: "Applied 1 migration(s) in batch 1."

roost migrate:status
# Expect: [applied ] 0000_<name>.sql

roost migrate
# Expect: "Nothing to migrate."

# Type check
bun run --filter @roostjs/orm typecheck
```

## Migration File Naming

`drizzle-kit generate` produces files named by its own convention (e.g. `0000_initial.sql`). The migrator sorts files lexicographically — the numeric prefix ensures correct ordering. Do not rename files drizzle-kit generates.

## Gotchas

- `d1.exec()` takes a multi-statement SQL string. drizzle-kit generates valid SQLite — this works correctly.
- The `_migrations` table uses `UNIQUE` on `name` — applying the same migration twice fails with a constraint error. This is intentional.
- For production deployment, use `roost migrate --remote`. This calls `wrangler d1 execute` without `--local`, targeting the remote D1 database.
- `drizzle-kit generate` requires `drizzle.config.ts` (created in Phase 1). Phase 2 depends on Phase 1.
- The `--json` flag on `wrangler d1 execute` returns results as JSON array. The parsing in `queryAppliedMigrations` handles the outer array wrapper wrangler adds.
- The `Migrator` class in `packages/orm/src/migrator.ts` is designed for use inside Workers (e.g. at app boot). The CLI commands use wrangler as a proxy to D1 — same data, different access path.
