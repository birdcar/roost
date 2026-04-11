# Phase 1: Schema Restructure + drizzle.config.ts

**Effort**: M (1-2 days)
**Blocks**: Phase 2, Phase 3
**Status**: Ready to implement

## Problem

`ModelRegistry.boot()` currently calls `sqliteTable()` dynamically at Worker startup using `static columns` from each model class. This means drizzle-kit cannot read schemas at build time — it needs static exports it can import. No `drizzle.config.ts` exists in generated projects, so `roost migrate` and `roost migrate:generate` are completely broken.

## Goal

Models export a `sqliteTable()` definition statically. `ModelRegistry.boot()` reads the pre-built `_table` and only assigns `_db`. `roost new` scaffolds a `drizzle.config.ts` that globs model files.

## Files Changed

| File | Change |
|------|--------|
| `packages/orm/src/registry.ts` | Simplify `boot()` — remove dynamic `sqliteTable()` construction |
| `packages/orm/src/model.ts` | Remove `static columns` property |
| `packages/cli/src/commands/make.ts` | Update `makeModel` template |
| `packages/cli/src/commands/new.ts` | Add `drizzle.config.ts` generation, add `drizzle-kit` to devDeps |

## Implementation

### Step 1 — Simplify `ModelRegistry.boot()`

Current `registry.ts` builds a `sqliteTable()` for each model by reading `static columns`. Replace this with a loop that reads `static _table` (already set by the model file) and assigns `_db`.

**Before** (`packages/orm/src/registry.ts`):
```ts
boot(d1: D1Database): void {
  const schema: Record<string, ReturnType<typeof sqliteTable>> = {};

  for (const [, modelClass] of this.models) {
    const tableName = modelClass.tableName ?? toTableName(modelClass.name);
    const columns: Record<string, any> = {
      id: integer('id').primaryKey({ autoIncrement: true }),
      ...(modelClass as any).columns,
    };

    if (modelClass.timestamps) {
      columns.created_at = text('created_at').notNull().$defaultFn(() => new Date().toISOString());
      columns.updated_at = text('updated_at').notNull().$defaultFn(() => new Date().toISOString());
    }

    if (modelClass.softDeletes) {
      columns.deleted_at = text('deleted_at');
    }

    const table = sqliteTable(tableName, columns);
    schema[tableName] = table;
    modelClass._table = table;
  }

  const db = drizzle(d1 as any, { schema });

  for (const [, modelClass] of this.models) {
    modelClass._db = db as any;
  }
}
```

**After**:
```ts
boot(d1: D1Database): void {
  const schema: Record<string, SQLiteTableWithColumns<any>> = {};

  for (const [, modelClass] of this.models) {
    if (!modelClass._table) {
      throw new Error(
        `Model "${modelClass.name}" has no static _table. ` +
        'Export a sqliteTable() and assign it to static _table.'
      );
    }
    const tableName = modelClass.tableName ?? toTableName(modelClass.name);
    schema[tableName] = modelClass._table;
  }

  const db = drizzle(d1 as any, { schema });

  for (const [, modelClass] of this.models) {
    modelClass._db = db as any;
  }
}
```

Remove the `sqliteTable`, `text`, and `integer` imports from `registry.ts` — they're no longer used here.

### Step 2 — Remove `static columns` from `Model`

The `static columns` property in `packages/orm/src/model.ts` is the escape hatch the old registry used. Remove it entirely. The base class only needs `_table` and `_db`.

No other changes to `model.ts` are needed for this phase.

### Step 3 — Update `makeModel` template

Current template (`packages/cli/src/commands/make.ts`, `makeModel` function) generates a class with `static columns = {}`. Replace it with a `sqliteTable()` export + class with `static _table`.

**New template output** (for `roost make:model User`):
```ts
import { Model } from '@roost/orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // name: text('name').notNull(),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export class User extends Model {
  static tableName = 'users';
  static _table = users;
}
```

Key details:
- The `const` name is the `table` variable (snake_case plural of the model name)
- `id`, `created_at`, `updated_at` are included in the static schema — not added dynamically
- `static timestamps = true` can remain on `Model` base but the timestamp columns must now be in the `sqliteTable()` call so drizzle-kit sees them
- Add a comment placeholder for columns so devs know where to add their fields

Template generation code in `make.ts`:
```ts
export async function makeModel(name: string): Promise<void> {
  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);
  const table = toTableName(name);

  const content = `import { Model } from '@roost/orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const ${table} = sqliteTable('${table}', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // name: text('name').notNull(),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export class ${pascal} extends Model {
  static tableName = '${table}';
  static _table = ${table};
}
`;

  await writeIfNotExists(join('src', 'models', `${kebab}.ts`), content);
}
```

### Step 4 — Generate `drizzle.config.ts` in `roost new`

In `packages/cli/src/commands/new.ts`, add two changes:

**4a. Add `drizzle-kit` to generated `devDependencies`**:

In the `pkg` object's `devDependencies`:
```ts
devDependencies: {
  // ... existing entries ...
  'drizzle-kit': 'latest',
},
```

**4b. Write `drizzle.config.ts`**:

After the other `writeFile` calls in `newProject()`:
```ts
await writeFile(join(dir, 'drizzle.config.ts'), `import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/models/*.ts',
  out: './database/migrations',
});
`);
```

The `schema: './src/models/*.ts'` glob means drizzle-kit will pick up all `sqliteTable()` exports from model files automatically — no manual registration.

## Validation

Run after each step:

```bash
# From repo root
bun test --filter @roost/orm

# After make.ts changes — verify template output looks right
# (no automated test for generator output, eyeball it)

# Type check
bun run --filter @roost/orm typecheck
```

The existing `registry.test.ts` test registers a fake model with `_table: null`. Update the fake model to have a real `_table` set, or the new boot logic will throw. Concretely:

```ts
// packages/orm/__tests__/registry.test.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

const fakeTable = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
});

const FakeModel = {
  name: 'User',
  tableName: 'users',
  timestamps: true,
  softDeletes: false,
  _table: fakeTable,
  _db: null,
} as any;
```

## Gotchas

- `static timestamps = true` on `Model` is still used by `create()` and `save()` to set `created_at`/`updated_at` values at write time. Do not remove it. The columns just need to also exist in the `sqliteTable()` schema now.
- `toTableName` in `registry.ts` is still used to derive the schema key. Keep it.
- The `getSchema()` method on `ModelRegistry` reads `modelClass._table` — it already works correctly once models define `_table` statically. No change needed there.
- The `OrmServiceProvider` in `provider.ts` calls `registry.boot(d1Wrapper.raw)` — no change needed.
- Model files that set `static softDeletes = true` need to manually include `deleted_at: text('deleted_at')` in their `sqliteTable()` schema. The registry no longer adds it. Document this in the model template comment.
