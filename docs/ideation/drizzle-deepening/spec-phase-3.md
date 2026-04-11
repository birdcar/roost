# Phase 3: Relations + Query API Enhancement

**Effort**: M (1-2 days)
**Blocked by**: Phase 1
**Parallel with**: Phase 2
**Status**: Ready to implement after Phase 1

## Problem

`QueryBuilder.with()` collects relation names into `eagerLoad[]` and ignores them — no eager loading happens. `HasManyRelation`, `HasOneRelation`, and `BelongsToRelation` in `relations.ts` are never wired to `Model` or `QueryBuilder`. `orWhere()` only supports `=` (no operator argument). There is no escape hatch to raw Drizzle when the query builder is insufficient.

## Goal

- Relations declared via Drizzle's `relations()` function in model files
- `QueryBuilder.with()` delegates to `db.query.{table}.findMany({ with: {...} })`
- `Model.query()` returns a relational-API-backed `QueryBuilder`
- `Model.drizzle()` escape hatch returns the raw Drizzle `db` instance
- `orWhere()` supports operators (same signature as `where()`)
- Dead `eagerLoad` code path replaced with real implementation

## Files Changed

| File | Change |
|------|--------|
| `packages/orm/src/model.ts` | Add `query()`, `drizzle()`, fix `orWhere()`, refactor `QueryBuilder` for relational API |
| `packages/orm/src/registry.ts` | Collect relations into schema, pass to `drizzle()` |
| `packages/orm/src/relations.ts` | Replace custom classes with Drizzle `relations()` pattern |
| `packages/orm/src/index.ts` | Update exports |
| `packages/cli/src/commands/make.ts` | Update `makeModel` template with `relations()` stub |

## Background: Drizzle's Relational API

Drizzle's `db.query` API requires:

1. A schema object passed to `drizzle(d1, { schema })` that includes both tables AND `relations()` declarations
2. `relations()` imported from `drizzle-orm` and called alongside `sqliteTable()`

```ts
// Example model file
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));
```

Then `db.query.users.findMany({ with: { posts: true } })` loads users with their posts in a single query.

## Implementation

### Step 1 — Replace `relations.ts`

The existing `HasManyRelation`, `HasOneRelation`, `BelongsToRelation` classes do manual N+1 loading. Replace the file entirely with helpers that produce Drizzle `relations()` declarations:

```ts
// packages/orm/src/relations.ts
export { relations, type InferSelectModel } from 'drizzle-orm';
```

This is a pure re-export. The actual `relations()` calls live in each model file — not in a base class. This is Drizzle's idiomatic pattern.

Remove the old class implementations and the `Relation` interface — they're replaced by Drizzle's type-safe approach.

Update `packages/orm/src/index.ts` to remove the old class exports and add the re-export:
```ts
// Remove:
export { HasManyRelation, HasOneRelation, BelongsToRelation } from './relations.js';
export type { Relation } from './relations.js';

// Add:
export { relations } from './relations.js';
```

### Step 2 — Update `ModelRegistry` to collect relations

The schema object passed to `drizzle()` must include both tables and `relations()` declarations. The registry needs to collect exported `relations` objects from each model's module.

The cleanest approach: models pass their relations to `register()`. Update `ModelRegistry`:

```ts
// packages/orm/src/registry.ts
import { drizzle } from 'drizzle-orm/d1';
import type { SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core';
import type { Model } from './model.js';

export class ModelRegistry {
  private models = new Map<string, typeof Model>();
  private relationObjects: unknown[] = [];

  register(modelClass: typeof Model, relations?: unknown): void {
    this.models.set(modelClass.name, modelClass);
    if (relations) this.relationObjects.push(relations);
  }

  boot(d1: D1Database): void {
    const schema: Record<string, unknown> = {};

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

    // Merge relation objects into schema so db.query API can resolve them
    for (const rel of this.relationObjects) {
      Object.assign(schema, rel);
    }

    const db = drizzle(d1 as any, { schema });

    for (const [, modelClass] of this.models) {
      modelClass._db = db as any;
    }
  }

  // ... getSchema(), getModels() unchanged
}
```

Usage in `OrmServiceProvider` (or app boot code) becomes:

```ts
import { users, usersRelations } from './models/user.js';
import { posts, postsRelations } from './models/post.js';

registry.register(User, usersRelations);
registry.register(Post, postsRelations);
```

> **Alternative approach**: The registry could auto-discover relations by looking for exported symbols ending in `Relations` from each model's module. This is more magical and harder to type. Prefer explicit registration for now.

### Step 3 — Add `query()` and `drizzle()` to `Model`

Add two static methods to the base `Model` class in `packages/orm/src/model.ts`:

```ts
// Returns a QueryBuilder backed by the relational API
static query<T extends typeof Model>(this: T): QueryBuilder<T> {
  return new QueryBuilder(this);
}

// Escape hatch: returns the raw Drizzle db instance
static drizzle<T extends typeof Model>(this: T): DrizzleD1Database<any> {
  const { db } = this.ensureBooted();
  return db;
}
```

`query()` is equivalent to starting a new `QueryBuilder` — it's syntactic sugar that reads more clearly than `User.where(...)` when chaining begins with `.with()`:

```ts
// With escape hatch for complex queries:
const users = await User.drizzle()
  .select({ id: users.id, name: users.name })
  .from(users)
  .leftJoin(posts, eq(users.id, posts.userId))
  .where(gt(users.id, 0));
```

### Step 4 — Refactor `QueryBuilder` to use relational API for `.with()`

The `QueryBuilder` currently builds queries using `db.select().from(table)`. When `.with()` is called, it should switch to `db.query.{tableName}.findMany({ with: {...} })`.

Key challenge: Drizzle's `db.query.{tableName}` is accessed by the table name (string key on `db.query`). The table name is available via `modelClass.tableName ?? toTableName(modelClass.name)`.

```ts
export class QueryBuilder<TModel extends typeof Model> {
  private wheres: Array<{ type: 'and' | 'or'; column: string; op: string; value: unknown }> = [];
  private orders: Array<{ column: string; direction: 'asc' | 'desc' }> = [];
  private limitValue: number | null = null;
  private offsetValue: number | null = null;
  private withRelations: Record<string, true | { with?: Record<string, unknown> }> = {};

  constructor(private modelClass: TModel) {}

  // ... where(), whereIn(), whereNull(), whereNotNull(), orderBy(), limit(), offset() unchanged

  // Fix orWhere() to support operators (same overloads as where())
  orWhere(column: string, value: unknown): this;
  orWhere(column: string, op: string, value: unknown): this;
  orWhere(column: string, opOrValue: unknown, maybeValue?: unknown): this {
    if (maybeValue !== undefined) {
      this.wheres.push({ type: 'or', column, op: opOrValue as string, value: maybeValue });
    } else {
      this.wheres.push({ type: 'or', column, op: '=', value: opOrValue });
    }
    return this;
  }

  with(...relations: string[]): this {
    for (const rel of relations) {
      this.withRelations[rel] = true;
    }
    return this;
  }

  async first(): Promise<InstanceType<TModel> | null> {
    this.limitValue = 1;
    const results = await this.execute();
    return results[0] ?? null;
  }

  // ... firstOrFail(), count(), paginate() unchanged

  async all(): Promise<InstanceType<TModel>[]> {
    return this.execute();
  }

  private async execute(): Promise<InstanceType<TModel>[]> {
    const hasRelations = Object.keys(this.withRelations).length > 0;

    if (hasRelations) {
      return this.executeRelational();
    }

    return this.executeSql();
  }

  private async executeRelational(): Promise<InstanceType<TModel>[]> {
    const { db } = this.getDbAndTable();
    const tableName = this.modelClass.tableName ?? toTableName(this.modelClass.name);

    const queryTable = (db.query as Record<string, any>)[tableName];
    if (!queryTable) {
      throw new Error(
        `db.query.${tableName} is not available. ` +
        'Ensure relations are registered via registry.register(Model, relations).'
      );
    }

    const config: Record<string, unknown> = {
      with: this.withRelations,
    };

    if (this.wheres.length > 0) {
      const { table } = this.getDbAndTable();
      config.where = this.buildWhereClause(table);
    }

    if (this.orders.length > 0) {
      const { table } = this.getDbAndTable();
      config.orderBy = this.orders.map((o) => {
        const col = table[o.column];
        return o.direction === 'desc' ? desc(col) : asc(col);
      });
    }

    if (this.limitValue !== null) config.limit = this.limitValue;
    if (this.offsetValue !== null) config.offset = this.offsetValue;

    const rows = await queryTable.findMany(config);
    return rows.map((r: unknown) => new (this.modelClass as any)(r) as InstanceType<TModel>);
  }

  private async executeSql(): Promise<InstanceType<TModel>[]> {
    // Existing implementation unchanged
    const { db, table } = this.getDbAndTable();
    let query = db.select().from(table) as any;

    if (this.wheres.length > 0) {
      query = query.where(this.buildWhereClause(table));
    }

    for (const order of this.orders) {
      const col = table[order.column];
      query = query.orderBy(order.direction === 'desc' ? desc(col) : asc(col));
    }

    if (this.limitValue !== null) query = query.limit(this.limitValue);
    if (this.offsetValue !== null) query = query.offset(this.offsetValue);

    const rows = await query;
    return rows.map((r: unknown) => new (this.modelClass as any)(r) as InstanceType<TModel>);
  }

  // buildWhereClause() unchanged — used by both paths
}
```

Remove the now-unused `eagerLoad: string[]` field and the old `with()` implementation.

Import `toTableName` from `registry.ts` in `model.ts` (or move it to a shared `utils.ts`):

```ts
import { toTableName } from './registry.js';
```

### Step 5 — Update `makeModel` template

The `makeModel` template from Phase 1 generates a `sqliteTable()` export and a class. Extend it with a `relations()` stub so devs know where to add them:

```ts
import { Model } from '@roost/orm';
import { relations } from '@roost/orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const ${table} = sqliteTable('${table}', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // name: text('name').notNull(),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const ${table}Relations = relations(${table}, ({ one, many }) => ({
  // posts: many(posts),
  // profile: one(profiles, { fields: [${table}.id], references: [profiles.userId] }),
}));

export class ${pascal} extends Model {
  static tableName = '${table}';
  static _table = ${table};
}
```

The `relations()` export name follows Drizzle's convention: `${tableName}Relations`. This is the symbol passed as the second arg to `registry.register(Model, ${table}Relations)`.

## Usage After Implementation

### Defining relations

```ts
// src/models/user.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from '@roost/orm';
import { posts } from './post.js';
import { Model } from '@roost/orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export class User extends Model {
  static tableName = 'users';
  static _table = users;
}
```

### Registering with relations

```ts
// src/app.ts (or bootstrap)
import { User, usersRelations } from './models/user.js';
import { Post, postsRelations } from './models/post.js';

new OrmServiceProvider(app)
  .withModels([
    [User, usersRelations],
    [Post, postsRelations],
  ])
  .register();
```

> This requires a small update to `OrmServiceProvider.withModels()` to accept `[typeof Model, unknown]` tuples alongside plain `typeof Model` entries. Update `provider.ts` accordingly.

### Querying with eager loading

```ts
// Loads users with their posts — single query via Drizzle relational API
const users = await User.query().with('posts').all();

// Filters + eager loading
const activeUsers = await User.query()
  .where('status', 'active')
  .with('posts', 'profile')
  .orderBy('name')
  .all();

// Escape hatch for complex queries
import { users } from './models/user.js';
import { posts } from './models/post.js';
import { eq } from 'drizzle-orm';

const result = await User.drizzle()
  .select({ userName: users.name, postTitle: posts.title })
  .from(users)
  .leftJoin(posts, eq(users.id, posts.userId));
```

## Validation

```bash
# From repo root
bun test --filter @roost/orm

# Type check
bun run --filter @roost/orm typecheck
```

Update `packages/orm/__tests__/registry.test.ts` to cover the new `register(Model, relations)` signature:

```ts
test('registers model with relations', () => {
  const registry = new ModelRegistry();
  const fakeTable = sqliteTable('users', { id: integer('id').primaryKey({ autoIncrement: true }) });
  const FakeModel = { name: 'User', tableName: 'users', _table: fakeTable, _db: null } as any;
  const fakeRelations = {}; // relations() return value (opaque object)

  registry.register(FakeModel, fakeRelations);

  expect(registry.getModels().has('User')).toBe(true);
});
```

## Gotchas

- Drizzle's `db.query.{tableName}` key must exactly match the key used in the schema object passed to `drizzle()`. The registry uses `tableName ?? toTableName(modelClass.name)` — both the schema key and the `db.query` lookup must use the same derivation.
- `relations()` from drizzle-orm returns an opaque object (`Relations` type). The registry stores it as `unknown` and spreads it into the schema — this is the correct pattern per Drizzle docs.
- Circular imports: `user.ts` may import `posts` from `post.ts` for `relations()`, and `post.ts` may import `users` from `user.ts`. This creates circular imports. Drizzle handles this with lazy evaluation in `relations()` callbacks — the table references in the callback are not evaluated at import time, only when the relational API resolves queries. This works correctly in practice.
- The `count()` method on `QueryBuilder` uses `db.select({ count: sql\`count(*)\` })` — it doesn't support `with()`. If `with()` is called before `count()`, ignore `withRelations` in the count path. Document this limitation.
- Remove `InvalidRelationError` from `errors.ts` if it becomes unused after the relations rewrite, or keep it for the new "relation not registered" error path.
