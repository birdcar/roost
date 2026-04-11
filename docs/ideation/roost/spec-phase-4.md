# Implementation Spec: Roost Framework - Phase 4

**Contract**: ./contract.md
**PRD**: ./prd-phase-4.md
**Estimated Effort**: XL

## Technical Approach

Phase 4 is a wrapping phase, not a building phase. Drizzle ORM already handles D1 query execution, schema definition, and migration generation via Drizzle Kit. The work here is building a Laravel-like model class layer on top of it — so developers never write raw `drizzle(d1).select().from(users).where(eq(users.email, email))`. They write `User.where('email', email).first()` and the framework figures out the rest.

The architecture has three tiers:

1. **Schema tier**: Model class static properties define columns using Drizzle column builders. At boot time, a `ModelRegistry` collects all model classes and calls `drizzle()` with their combined schemas. The compiled Drizzle schema is stored on the registry and is the single source of truth for both queries and Drizzle Kit migration generation.

2. **Query builder tier**: A `QueryBuilder<T extends Model>` class wraps Drizzle query objects. Every static method on `Model` (`where`, `find`, `create`, etc.) creates a new `QueryBuilder` instance. Chaining methods return `this` for the builder. Terminal methods (`first`, `all`, `count`, `paginate`) execute against Drizzle and map rows to model instances.

3. **Relationship tier**: Relationship methods (`hasMany`, `hasOne`, `belongsTo`, `belongsToMany`) return typed `Relation` descriptor objects. They don't execute queries immediately. Eager loading via `.with('posts')` batches the relation queries on the `QueryBuilder` before the terminal method fires, preventing N+1s.

Factories use `@faker-js/faker` for data generation. They are test-only — they never ship in production bundles. Seeder classes compose factories and run via the CLI.

Model events use a synchronous observer list per model class. Hooks can abort mutations by returning `false` from `creating` or `updating`.

## Feedback Strategy

**Inner-loop command**: `bun test --filter packages/orm`

**Playground**: `bun:test` suite in `packages/orm/__tests__/`. Each component (model, query builder, relationships, migrations, factories, events) has its own test file. D1 is mocked via a `MockD1Database` class that stores data in a `Map`.

**Why this approach**: The ORM has no UI surface. The fastest cycle is writing a test that exercises the query builder, seeing the generated SQL via a spy, and verifying the result shape. The mock D1 lets tests run in < 2 seconds without needing a real D1 instance.

## File Changes

### New Files

| File Path | Purpose |
|---|---|
| `packages/orm/package.json` | @roost/orm package manifest |
| `packages/orm/tsconfig.json` | Extends base TS config |
| `packages/orm/src/index.ts` | Public API barrel export |
| `packages/orm/src/model.ts` | Model base class |
| `packages/orm/src/query-builder.ts` | Fluent query builder |
| `packages/orm/src/relations.ts` | Relation descriptor types and helpers |
| `packages/orm/src/registry.ts` | ModelRegistry — collects schemas at boot |
| `packages/orm/src/schema.ts` | Schema derivation from model static props |
| `packages/orm/src/hooks.ts` | Lifecycle hook machinery |
| `packages/orm/src/scopes.ts` | Query scope types and application |
| `packages/orm/src/factory.ts` | Factory base class |
| `packages/orm/src/seeder.ts` | Seeder base class |
| `packages/orm/src/pagination.ts` | Paginator result type |
| `packages/orm/src/errors.ts` | ORM-specific error types |
| `packages/orm/src/types.ts` | Shared type definitions |
| `packages/orm/src/provider.ts` | OrmServiceProvider |
| `packages/orm/__tests__/model.test.ts` | Model CRUD and schema tests |
| `packages/orm/__tests__/query-builder.test.ts` | Query builder chain and execution tests |
| `packages/orm/__tests__/relations.test.ts` | Relationship loading tests |
| `packages/orm/__tests__/hooks.test.ts` | Lifecycle hook tests |
| `packages/orm/__tests__/factory.test.ts` | Factory and seeder tests |
| `packages/orm/__tests__/scopes.test.ts` | Query scope tests |
| `packages/orm/__tests__/pagination.test.ts` | Paginator tests |

### Modified Files

| File Path | Change |
|---|---|
| `packages/cloudflare/src/bindings/d1.ts` | Expose raw `D1Database` accessor for Drizzle adapter |
| `packages/cloudflare/src/index.ts` | Export D1 accessor type |

## Implementation Details

---

### 1. Package Setup

**Overview**: `@roost/orm` is a peer of `@roost/cloudflare`, depending on it for the D1 binding. Drizzle ORM and Drizzle Kit are direct dependencies. `@faker-js/faker` is a dev dependency (test data only).

```json
// packages/orm/package.json
{
  "name": "@roost/orm",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "drizzle-orm": "^0.44.0",
    "@roost/cloudflare": "workspace:*",
    "@roost/core": "workspace:*"
  },
  "devDependencies": {
    "drizzle-kit": "^0.30.0",
    "@faker-js/faker": "^9.0.0",
    "@cloudflare/workers-types": "^4.0.0"
  }
}
```

**Key decisions**:
- Drizzle Kit is a dev dependency — migration generation is a CLI operation, never a runtime operation. Drizzle ORM itself is a runtime dependency.
- `@faker-js/faker` is devDependencies. Factory classes import from it only in test contexts. The `Factory` base class itself doesn't reference faker — subclasses bring it in. This keeps the production bundle clean.

**Implementation steps**:
1. Create `packages/orm/` directory with `package.json`, `tsconfig.json`
2. Run `bun install` to wire workspace dependencies
3. Verify `import type { D1Database } from '@cloudflare/workers-types'` resolves in the package
4. Write a trivial smoke test to confirm the package is discovered by `bun test`

**Feedback loop**:
- **Playground**: `packages/orm/__tests__/` (once tests exist)
- **Check command**: `bun test --filter packages/orm`

---

### 2. Model Base Class

**Overview**: `Model` is the centerpiece. It holds a static Drizzle table schema, a reference to the `ModelRegistry`, and all the static query entry points. Instance properties map column names to typed values. The class uses TypeScript's `this` type so that subclass static methods return the subclass type, not the base `Model` type.

```typescript
// packages/orm/src/model.ts

import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core';
import type { QueryBuilder } from './query-builder.ts';
import type { ModelRegistry } from './registry.ts';

// The column definition map a subclass declares
export type ColumnMap = Record<string, ReturnType<typeof text | typeof integer | typeof real>>;

// Infer the row type from a column map
export type InferRow<TColumns extends ColumnMap> = {
  [K in keyof TColumns]: TColumns[K] extends ReturnType<typeof text>
    ? string
    : TColumns[K] extends ReturnType<typeof integer<string, 'number'>>
    ? number
    : TColumns[K] extends ReturnType<typeof real>
    ? number
    : unknown;
};

// Base attributes every model row has
export type BaseAttributes = {
  id: number;
  createdAt: string;
  updatedAt: string;
};

export abstract class Model<TColumns extends ColumnMap = ColumnMap> {
  // Subclasses declare their columns here
  static columns: ColumnMap = {};

  // The compiled Drizzle table — set by ModelRegistry at boot
  static _table: SQLiteTableWithColumns<never> | null = null;

  // The Drizzle DB instance — injected by OrmServiceProvider
  static _db: DrizzleD1Database | null = null;

  // The table name — defaults to lowercased plural class name
  static tableName: string | null = null;

  // The primary key column — defaults to 'id'
  static primaryKey = 'id';

  // Timestamps — set to false to disable auto createdAt/updatedAt
  static timestamps = true;

  // Soft deletes — set to true to add deletedAt column
  static softDeletes = false;

  // Instance data
  readonly attributes: BaseAttributes & InferRow<TColumns>;

  constructor(attributes: BaseAttributes & InferRow<TColumns>) {
    this.attributes = attributes;
    // Proxy so user.email reads as user.attributes.email
    return new Proxy(this, {
      get(target, prop: string) {
        if (prop in target) return (target as Record<string, unknown>)[prop];
        if (prop in target.attributes) return (target.attributes as Record<string, unknown>)[prop];
        return undefined;
      },
    });
  }

  // Static query entry points — each returns a QueryBuilder
  static query<T extends typeof Model>(this: T): QueryBuilder<T> { ... }
  static where<T extends typeof Model>(this: T, column: string, value: unknown): QueryBuilder<T> { ... }
  static find<T extends typeof Model>(this: T, id: number): Promise<InstanceType<T> | null> { ... }
  static findOrFail<T extends typeof Model>(this: T, id: number): Promise<InstanceType<T>> { ... }
  static all<T extends typeof Model>(this: T): Promise<InstanceType<T>[]> { ... }
  static first<T extends typeof Model>(this: T): Promise<InstanceType<T> | null> { ... }
  static create<T extends typeof Model>(this: T, attributes: Partial<InferRow<ColumnMap>>): Promise<InstanceType<T>> { ... }

  // Instance mutation
  async save(): Promise<this> { ... }
  async update(attributes: Partial<InferRow<TColumns>>): Promise<this> { ... }
  async delete(): Promise<void> { ... }

  // Relationship factories (return Relation descriptors, not queries)
  protected hasOne(related: typeof Model, foreignKey?: string): HasOneRelation { ... }
  protected hasMany(related: typeof Model, foreignKey?: string): HasManyRelation { ... }
  protected belongsTo(related: typeof Model, foreignKey?: string): BelongsToRelation { ... }
  protected belongsToMany(related: typeof Model, pivotTable: string, foreignKey?: string, relatedKey?: string): BelongsToManyRelation { ... }
}
```

**Key decisions**:
- The Proxy in the constructor makes `user.email` work instead of requiring `user.attributes.email`. The proxy checks the attributes map as a fallback. This is a thin, well-understood pattern.
- Static methods use the `this: T` polymorphic `this` type so `User.where(...)` returns `QueryBuilder<typeof User>`, not `QueryBuilder<typeof Model>`. This is the critical type trick that makes the whole chain typed.
- `_db` and `_table` are set by `OrmServiceProvider` at boot — models are pure class definitions until the provider wires them up. This means models can be imported anywhere without triggering D1 access.
- `tableName` defaults to `null` — the registry derives it from the class name if not set (e.g., `User` → `users`).

**Implementation steps**:
1. Define `ColumnMap`, `InferRow`, `BaseAttributes` types in `types.ts`
2. Implement `Model` class with static properties and constructor proxy
3. Leave query method bodies as stubs (`{ ... }`) until `QueryBuilder` exists
4. Write `model.test.ts`: instantiate a `User extends Model`, access `user.email`, verify type inference compiles

**Feedback loop**:
- **Check command**: `bun run tsc --noEmit --filter packages/orm`

---

### 3. Model Registry

**Overview**: `ModelRegistry` is a singleton that collects all `Model` subclasses registered via `OrmServiceProvider`. At boot, it calls `sqliteTable()` for each model using their `columns` definition, appending timestamp columns if `timestamps = true`. It then calls `drizzle(d1, { schema })` once and distributes the resulting `db` instance back to each model's `_db` static property.

```typescript
// packages/orm/src/registry.ts

import { drizzle } from 'drizzle-orm/d1';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import type { D1Database } from '@cloudflare/workers-types';
import type { Model } from './model.ts';

export class ModelRegistry {
  private models = new Map<string, typeof Model>();

  register(modelClass: typeof Model): void {
    this.models.set(modelClass.name, modelClass);
  }

  /**
   * Called by OrmServiceProvider at boot. Compiles each model's columns
   * into a Drizzle table, creates the unified schema object, initializes
   * the drizzle() DB instance, and distributes it to all models.
   */
  boot(d1: D1Database): void {
    const schema: Record<string, ReturnType<typeof sqliteTable>> = {};

    for (const [, modelClass] of this.models) {
      const tableName = modelClass.tableName ?? toTableName(modelClass.name);
      const columns = { ...modelClass.columns };

      if (modelClass.timestamps) {
        columns.createdAt = text('created_at').notNull().$defaultFn(() => new Date().toISOString());
        columns.updatedAt = text('updated_at').notNull().$defaultFn(() => new Date().toISOString());
      }

      if (modelClass.softDeletes) {
        columns.deletedAt = text('deleted_at');
      }

      const table = sqliteTable(tableName, {
        id: integer('id').primaryKey({ autoIncrement: true }),
        ...columns,
      });

      schema[tableName] = table;
      modelClass._table = table;
    }

    const db = drizzle(d1, { schema });

    for (const [, modelClass] of this.models) {
      modelClass._db = db;
    }
  }

  /** Returns the raw Drizzle schema for use with drizzle-kit */
  getSchema(): Record<string, ReturnType<typeof sqliteTable>> {
    const schema: Record<string, ReturnType<typeof sqliteTable>> = {};
    for (const [, modelClass] of this.models) {
      const tableName = modelClass.tableName ?? toTableName(modelClass.name);
      if (modelClass._table) schema[tableName] = modelClass._table;
    }
    return schema;
  }
}

/** 'UserProfile' → 'user_profiles' */
function toTableName(className: string): string {
  return className
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .slice(1) + 's';
}
```

**Key decisions**:
- The registry builds one `drizzle()` instance. This is important because Drizzle's relational query API (`db.query.users.findMany({ with: { posts: true } })`) requires all related tables to be in the same schema object passed to `drizzle()`. A model-per-drizzle-instance approach breaks relations.
- `getSchema()` is used by the CLI's `roost migrate` command to pass the schema to Drizzle Kit for migration diffing.
- The `id` column is always injected by the registry — models don't declare it. This matches Eloquent's convention.

**Implementation steps**:
1. Implement `toTableName()` utility
2. Implement `ModelRegistry.register()` and `boot()`
3. Implement `getSchema()` for CLI use
4. Test: register two models, boot with mock D1, verify `_table` set on both, verify schema has both tables

---

### 4. Query Builder

**Overview**: `QueryBuilder<T extends typeof Model>` accumulates `where` conditions, `orderBy` clauses, `with` relations, `limit`, and `offset` via method chaining. Terminal methods translate accumulated state into Drizzle queries and return typed model instances.

```typescript
// packages/orm/src/query-builder.ts

import { eq, ne, gt, gte, lt, lte, like, inArray, isNull, isNotNull, or, and, count, sum, avg } from 'drizzle-orm';
import type { Model, InferRow, ColumnMap } from './model.ts';
import type { PaginationResult } from './pagination.ts';

type WhereClause = {
  type: 'and' | 'or';
  condition: ReturnType<typeof eq>;
};

type OrderClause = {
  column: string;
  direction: 'asc' | 'desc';
};

export class QueryBuilder<TModel extends typeof Model> {
  private wheres: WhereClause[] = [];
  private orders: OrderClause[] = [];
  private withs: string[] = [];
  private limitValue: number | null = null;
  private offsetValue: number | null = null;

  constructor(private modelClass: TModel) {}

  where(column: string, value: unknown): this;
  where(column: string, operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'like', value: unknown): this;
  where(...args: unknown[]): this { ... }

  orWhere(column: string, value: unknown): this { ... }
  whereIn(column: string, values: unknown[]): this { ... }
  whereNull(column: string): this { ... }
  whereNotNull(column: string): this { ... }

  orderBy(column: string, direction: 'asc' | 'desc' = 'asc'): this { ... }
  limit(n: number): this { ... }
  offset(n: number): this { ... }

  /** Eager-load named relationships to prevent N+1 queries */
  with(...relations: string[]): this {
    this.withs.push(...relations);
    return this;
  }

  // Terminal methods
  async first(): Promise<InstanceType<TModel> | null> { ... }
  async firstOrFail(): Promise<InstanceType<TModel>> { ... }
  async all(): Promise<InstanceType<TModel>[]> { ... }
  async count(): Promise<number> { ... }
  async sum(column: string): Promise<number> { ... }
  async avg(column: string): Promise<number> { ... }
  async paginate(page: number, perPage: number): Promise<PaginationResult<InstanceType<TModel>>> { ... }

  /** Compile accumulated state into a Drizzle query and execute */
  private async execute(): Promise<InstanceType<TModel>[]> {
    const db = this.modelClass._db;
    const table = this.modelClass._table;

    if (!db || !table) {
      throw new OrmNotBootedError(this.modelClass.name);
    }

    let query = db.select().from(table);

    if (this.wheres.length > 0) {
      query = query.where(this.buildWhereClause());
    }

    if (this.orders.length > 0) {
      for (const order of this.orders) {
        query = query.orderBy(
          order.direction === 'desc' ? desc(table[order.column]) : asc(table[order.column])
        );
      }
    }

    if (this.limitValue !== null) query = query.limit(this.limitValue);
    if (this.offsetValue !== null) query = query.offset(this.offsetValue);

    const rows = await query;
    const instances = rows.map(row => new this.modelClass(row) as InstanceType<TModel>);

    if (this.withs.length > 0) {
      await this.loadRelations(instances, this.withs);
    }

    return instances;
  }

  /** Batch-loads relations to avoid N+1. Called by execute() when .with() was used. */
  private async loadRelations(instances: InstanceType<TModel>[], relations: string[]): Promise<void> {
    for (const relation of relations) {
      // relation may be 'posts' or 'posts.comments' (nested eager loading)
      const [immediate, ...nested] = relation.split('.');
      const descriptor = (this.modelClass.prototype as Record<string, unknown>)[immediate];

      if (!descriptor || !isRelation(descriptor)) {
        throw new InvalidRelationError(this.modelClass.name, immediate);
      }

      await descriptor.load(instances, nested.length > 0 ? [nested.join('.')] : []);
    }
  }
}
```

**Key decisions**:
- `where(column, value)` and `where(column, operator, value)` are both supported via overloads. Single-argument where is `=` by default, matching Eloquent.
- `with()` accepts dot-notation for nested eager loading: `User.with('posts.comments').all()`. The loader splits on the first dot and recursively loads nested relations.
- `execute()` is private — external callers always use a terminal method. This prevents half-executed builder state from leaking.
- `OrmNotBootedError` is thrown if `_db` is null — gives a clear message if the ORM provider wasn't registered.

**Implementation steps**:
1. Implement `QueryBuilder` with `where`, `orWhere`, `whereIn`, `whereNull` variants
2. Implement `orderBy`, `limit`, `offset`
3. Implement `execute()` translating accumulated state to Drizzle
4. Implement terminal methods calling `execute()`
5. Implement `paginate()` with `PaginationResult` (total, perPage, currentPage, lastPage, data)
6. Stub `loadRelations()` — full implementation in Relations section
7. Wire `Model.where()`, `Model.all()`, etc. to create and use `QueryBuilder`
8. Test: `.where('email', email).first()` generates correct SQL, `.limit(5).offset(10)` correct SQL, `.count()` returns number

**Feedback loop**:
- **Playground**: `packages/orm/__tests__/query-builder.test.ts`
- **Experiment**: Create a `MockD1` that records SQL calls. Run `User.where('email', 'a@b.com').first()`. Assert the recorded SQL contains `WHERE email = 'a@b.com'`.
- **Check command**: `bun test --filter query-builder`

---

### 5. Relationships

**Overview**: Relationships are described as method calls on model instances but are lazy — they return `Relation` descriptors that execute queries only when awaited or when the `QueryBuilder` calls `loadRelations`. Each `Relation` type knows how to batch-load across multiple parent instances.

```typescript
// packages/orm/src/relations.ts

export interface Relation<TRelated extends typeof Model = typeof Model> {
  type: 'hasOne' | 'hasMany' | 'belongsTo' | 'belongsToMany';
  relatedModel: TRelated;
  foreignKey: string;
  localKey: string;
  /** Executes query for a single parent instance */
  load(parent: Model): Promise<InstanceType<TRelated> | InstanceType<TRelated>[] | null>;
  /** Batch-loads for multiple parents to prevent N+1 */
  loadMany(parents: Model[], nestedWith?: string[]): Promise<void>;
}

export class HasManyRelation<TRelated extends typeof Model> implements Relation<TRelated> {
  type = 'hasMany' as const;

  constructor(
    public relatedModel: TRelated,
    public foreignKey: string,
    public localKey: string,
  ) {}

  async load(parent: Model): Promise<InstanceType<TRelated>[]> {
    return this.relatedModel
      .where(this.foreignKey, (parent.attributes as Record<string, unknown>)[this.localKey])
      .all();
  }

  async loadMany(parents: Model[], nestedWith: string[] = []): Promise<void> {
    const parentIds = parents.map(p => (p.attributes as Record<string, unknown>)[this.localKey]);

    // Single query for all parents instead of N queries
    let qb = this.relatedModel.whereIn(this.foreignKey, parentIds);
    if (nestedWith.length > 0) qb = qb.with(...nestedWith);
    const related = await qb.all();

    // Group related by foreign key, assign to parent instances
    const grouped = new Map<unknown, InstanceType<TRelated>[]>();
    for (const item of related) {
      const key = (item.attributes as Record<string, unknown>)[this.foreignKey];
      const existing = grouped.get(key) ?? [];
      existing.push(item);
      grouped.set(key, existing);
    }

    for (const parent of parents) {
      const key = (parent.attributes as Record<string, unknown>)[this.localKey];
      (parent as Record<string, unknown>)[this.relatedModel.name.toLowerCase() + 's'] =
        grouped.get(key) ?? [];
    }
  }
}

// HasOneRelation, BelongsToRelation, BelongsToManyRelation follow the same pattern.
// BelongsToManyRelation issues a JOIN to the pivot table or two queries (pivot then related).
```

**Usage in model class**:

```typescript
class User extends Model {
  static columns = {
    email: text('email').notNull(),
    name: text('name').notNull(),
  };

  posts(): HasManyRelation<typeof Post> {
    return this.hasMany(Post, 'userId');
  }

  profile(): HasOneRelation<typeof Profile> {
    return this.hasOne(Profile, 'userId');
  }
}

// Accessing a relationship on an instance
const user = await User.find(1);
const posts = await user.posts().load(user);

// OR via eager loading (no N+1)
const users = await User.with('posts').all();
users[0].posts; // Post[] — already loaded
```

**Key decisions**:
- Relationship methods return `Relation` descriptors, not `Promise<...>`. This means `user.posts()` doesn't fire a query. The user calls `.load(user)` to execute. This keeps the pattern predictable.
- Eager loading via `.with('posts')` calls `loadMany()` on the descriptor after the primary query runs. `loadMany()` issues exactly ONE query for all parents — no N+1.
- `BelongsToMany` uses two queries (fetch pivot rows, then fetch related by IDs) instead of a JOIN. D1 has no query plan optimization — simple queries are safer than complex JOINs.
- After eager loading, relations are assigned as plain properties on the model instance (not descriptors). So `user.posts` after eager load is `Post[]`, not a function call.

**Implementation steps**:
1. Define `Relation` interface
2. Implement `HasManyRelation` with `load()` and `loadMany()`
3. Implement `HasOneRelation` (same as hasMany but returns first result or null)
4. Implement `BelongsToRelation` (query by local foreign key, return single related)
5. Implement `BelongsToManyRelation` (pivot table query, two-step load)
6. Wire `Model.hasMany()`, `Model.hasOne()`, etc. to return the appropriate Relation descriptor
7. Wire `QueryBuilder.loadRelations()` to call `loadMany()` on each descriptor
8. Test: `User.with('posts').all()` issues 2 queries total (not N+1). Assert SQL calls recorded.

**Feedback loop**:
- **Check command**: `bun test --filter relations`

---

### 6. Model Lifecycle Hooks

**Overview**: Each model class maintains a static list of `HookListener` functions keyed by event name. The `Model` base class fires hooks at the right moment in `create`, `save`, `update`, and `delete`. A hook returning `false` from `creating` or `updating` aborts the operation.

```typescript
// packages/orm/src/hooks.ts

export type HookEvent =
  | 'creating' | 'created'
  | 'updating' | 'updated'
  | 'deleting' | 'deleted';

export type HookListener<T extends Model = Model> = (
  instance: T
) => boolean | void | Promise<boolean | void>;

// Per-model hook registry (static, stored on the model class)
const hookRegistry = new WeakMap<typeof Model, Map<HookEvent, HookListener[]>>();

export function registerHook<T extends Model>(
  modelClass: typeof Model,
  event: HookEvent,
  listener: HookListener<T>
): void {
  if (!hookRegistry.has(modelClass)) {
    hookRegistry.set(modelClass, new Map());
  }
  const hooks = hookRegistry.get(modelClass)!;
  const existing = hooks.get(event) ?? [];
  existing.push(listener as HookListener);
  hooks.set(event, existing);
}

export async function fireHook<T extends Model>(
  modelClass: typeof Model,
  event: HookEvent,
  instance: T
): Promise<boolean> {
  const hooks = hookRegistry.get(modelClass);
  if (!hooks) return true;
  const listeners = hooks.get(event) ?? [];

  for (const listener of listeners) {
    const result = await listener(instance);
    if (result === false) return false; // abort
  }
  return true;
}
```

**Usage in model definitions**:

```typescript
class User extends Model {
  static columns = { email: text('email').notNull() };

  static boot() {
    // Static hooks defined on the model class
    this.creating(async (user) => {
      // Runs before insert — returning false aborts
      user.attributes.email = user.attributes.email.toLowerCase();
    });

    this.created(async (user) => {
      // Runs after insert
      await WelcomeMailJob.dispatch(user);
    });
  }
}

// External observer (from a ServiceProvider)
User.observe(new UserObserver());
```

**Key decisions**:
- `WeakMap<typeof Model, ...>` stores hooks per class. Using `WeakMap` means hooks are garbage-collected with the class if it's ever unloaded (module hot reload scenarios).
- `creating` and `updating` return `boolean` — `false` aborts. `created`, `updated`, `deleted` return `void`. This matches Eloquent's semantics exactly.
- The `static boot()` method is a convention for registering hooks on the model itself. `OrmServiceProvider` calls `boot()` on every registered model after wiring up `_db`.
- External observers (for cross-cutting concerns like audit logging) are registered via `Model.observe(observer)` which wires up all applicable hook events.

**Implementation steps**:
1. Implement `registerHook`, `fireHook` in `hooks.ts`
2. Add `static creating()`, `static created()`, etc. convenience methods to `Model`
3. Add `static observe()` to `Model` for observer objects
4. Add `static boot()` call to `OrmServiceProvider.boot()`
5. Wire hooks into `Model.create()`, `instance.save()`, `instance.update()`, `instance.delete()`
6. Test: hook fires on create, returning false from `creating` aborts insert, `creating` can mutate instance

---

### 7. Query Scopes

**Overview**: Scopes are reusable query fragments defined as static methods on the model. They receive the `QueryBuilder` and return it with additional constraints added.

```typescript
// packages/orm/src/scopes.ts

export type ScopeFunction<T extends typeof Model> = (
  query: QueryBuilder<T>
) => QueryBuilder<T>;

// Scopes are added to the model as static methods prefixed with 'scope'
// Convention: 'scopeActive' is callable as User.active()

// In Model.query() and direct static methods, we use a Proxy to intercept
// calls to undefined static methods and check for a 'scope' + methodName variant.
```

**Usage**:

```typescript
class User extends Model {
  static columns = {
    email: text('email').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    role: text('role').notNull().default('user'),
  };

  // Static scope — method name must start with 'scope'
  static scopeActive(query: QueryBuilder<typeof User>): QueryBuilder<typeof User> {
    return query.where('active', true);
  }

  static scopeAdmins(query: QueryBuilder<typeof User>): QueryBuilder<typeof User> {
    return query.where('role', 'admin');
  }
}

// Called without the 'scope' prefix
const activeUsers = await User.active().all();
const admins = await User.admins().all();
const activeAdmins = await User.active().admins().all();
```

**Key decisions**:
- Scope resolution uses a `Proxy` on `Model` (static side). When a static method is called that doesn't exist, the proxy checks for `scope${MethodName}`. If found, it calls it with a fresh `QueryBuilder`. This keeps the public API clean (no `scope` prefix on call site).
- Scopes are chainable with other query builder methods because they return the `QueryBuilder`.

**Implementation steps**:
1. Add static Proxy to `Model` class definition for scope resolution
2. Test: define `scopeActive`, call `User.active().all()`, verify the where clause is applied

---

### 8. Factory Base Class

**Overview**: Factories generate fake model data for tests and seeders. They extend `Factory<T extends Model>` and implement `definition()` returning a partial model attribute map. States layer additional attribute overrides on top of the base definition.

```typescript
// packages/orm/src/factory.ts

export abstract class Factory<TModel extends typeof Model> {
  protected abstract modelClass: TModel;
  private states: Array<Partial<InferRow<ColumnMap>>> = [];

  /** Base attribute definition — override in subclass */
  protected abstract definition(): Partial<InferRow<ColumnMap>>;

  /** Apply a named state by merging additional attributes */
  state(overrides: Partial<InferRow<ColumnMap>>): this {
    const clone = Object.create(this.constructor.prototype) as this;
    clone.states = [...this.states, overrides];
    return clone;
  }

  /** Create and persist one model instance */
  async create(overrides?: Partial<InferRow<ColumnMap>>): Promise<InstanceType<TModel>> {
    const attributes = this.resolveAttributes(overrides);
    return this.modelClass.create(attributes) as Promise<InstanceType<TModel>>;
  }

  /** Create and persist many model instances */
  async createMany(count: number, overrides?: Partial<InferRow<ColumnMap>>): Promise<InstanceType<TModel>[]> {
    return Promise.all(Array.from({ length: count }, () => this.create(overrides)));
  }

  /** Build a model instance without persisting */
  build(overrides?: Partial<InferRow<ColumnMap>>): InstanceType<TModel> {
    const attributes = this.resolveAttributes(overrides);
    return new this.modelClass(attributes as BaseAttributes & InferRow<ColumnMap>) as InstanceType<TModel>;
  }

  private resolveAttributes(overrides?: Partial<InferRow<ColumnMap>>): Partial<InferRow<ColumnMap>> {
    return Object.assign({}, this.definition(), ...this.states, overrides ?? {});
  }
}
```

**Example factory with states**:

```typescript
import { faker } from '@faker-js/faker';
import { Factory } from '@roost/orm';

class UserFactory extends Factory<typeof User> {
  protected modelClass = User;

  protected definition() {
    return {
      email: faker.internet.email(),
      name: faker.person.fullName(),
      role: 'user' as const,
      active: true,
    };
  }

  // Named state — fluent: new UserFactory().admin()
  admin(): this {
    return this.state({ role: 'admin' });
  }

  unverified(): this {
    return this.state({ active: false });
  }

  withPosts(count: number): this {
    // Registers a post-create hook on the factory instance
    return this.afterCreating(async (user) => {
      await new PostFactory().createMany(count, { userId: user.attributes.id });
    });
  }
}

// Usage in tests
const user = await new UserFactory().admin().create();
const users = await new UserFactory().createMany(5);
const userWithPosts = await new UserFactory().withPosts(3).create();
```

**Key decisions**:
- `state()` returns a new factory instance (cloned), not `this`. This makes factories immutable and safe for reuse in tests.
- `afterCreating()` registers a callback that runs after `create()`. This allows factories to create related data without tight coupling between factory definitions.
- `build()` (no DB write) vs `create()` (writes to DB) — same as Laravel. Use `build()` in pure unit tests that don't need a DB.
- `@faker-js/faker` is only imported inside factory subclass files, not in the base `Factory` class. The base class has no faker dependency.

**Implementation steps**:
1. Implement `Factory` base class with `definition`, `state`, `create`, `createMany`, `build`
2. Add `afterCreating()` hook support
3. Write `UserFactory` and `PostFactory` example in `__tests__/`
4. Test: `UserFactory.admin().create()` → user has `role: 'admin'`, `UserFactory.unverified().create()` → `active: false`, `withPosts(3)` → 3 related posts exist

---

### 9. Seeder Base Class

```typescript
// packages/orm/src/seeder.ts

export abstract class Seeder {
  abstract run(): Promise<void>;

  /** Call another seeder from this seeder */
  protected async call(seederClass: new () => Seeder): Promise<void> {
    await new seederClass().run();
  }
}

// Example usage
class DatabaseSeeder extends Seeder {
  async run() {
    await this.call(UserSeeder);
    await this.call(PostSeeder);
  }
}

class UserSeeder extends Seeder {
  async run() {
    await new UserFactory().createMany(10);
    await new UserFactory().admin().create();
  }
}
```

---

### 10. Pagination

```typescript
// packages/orm/src/pagination.ts

export type PaginationResult<T> = {
  data: T[];
  total: number;
  perPage: number;
  currentPage: number;
  lastPage: number;
  from: number;
  to: number;
  hasMorePages: boolean;
};

// QueryBuilder.paginate() implementation:
async paginate(page: number, perPage: number): Promise<PaginationResult<InstanceType<TModel>>> {
  const total = await this.count();
  const offset = (page - 1) * perPage;
  const data = await this.limit(perPage).offset(offset).all();

  return {
    data,
    total,
    perPage,
    currentPage: page,
    lastPage: Math.ceil(total / perPage),
    from: offset + 1,
    to: offset + data.length,
    hasMorePages: page < Math.ceil(total / perPage),
  };
}
```

---

### 11. ORM Service Provider

```typescript
// packages/orm/src/provider.ts

import type { ServiceProvider } from '@roost/core';
import type { D1Store } from '@roost/cloudflare';
import { ModelRegistry } from './registry.ts';

export class OrmServiceProvider extends ServiceProvider {
  private models: Array<typeof Model> = [];

  models(...modelClasses: Array<typeof Model>): this {
    this.models.push(...modelClasses);
    return this;
  }

  register(): void {
    const registry = new ModelRegistry();
    for (const model of this.models) {
      registry.register(model);
    }
    this.app.container.singleton(ModelRegistry, () => registry);
  }

  boot(): void {
    const registry = this.app.container.resolve(ModelRegistry);
    const d1 = this.app.container.resolve(D1Store);
    registry.boot(d1.raw()); // raw() exposes the underlying D1Database to Drizzle

    // Call static boot() on each model if defined
    for (const model of this.models) {
      if (typeof (model as Record<string, unknown>).boot === 'function') {
        (model as { boot(): void }).boot();
      }
    }
  }
}
```

---

### 12. Drizzle Kit Integration

**Overview**: Migration generation is a CLI-time operation. `roost migrate:generate` calls Drizzle Kit with the schema derived from `ModelRegistry.getSchema()`. This requires a `drizzle.config.ts` file in the project root that imports the registry and exports the schema.

```typescript
// Project root: drizzle.config.ts (generated by `roost new`)
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './app/models/index.ts', // barrel that exports all Model subclasses
  out: './database/migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID!,
    databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID!,
    token: process.env.CLOUDFLARE_API_TOKEN!,
  },
});
```

**Key decisions**:
- Migration generation uses Drizzle Kit's standard `drizzle-kit generate` command. The spec doesn't implement a custom migration engine — it provides the correct `drizzle.config.ts` shape and schema export pattern.
- Migration execution in production uses Wrangler's `wrangler d1 migrations apply` command. The CLI wraps this.
- The `_migrations` tracking table is created and managed by Drizzle Kit automatically.

**Implementation steps**:
1. Document the `drizzle.config.ts` pattern in the provider's JSDoc
2. Ensure `ModelRegistry.getSchema()` exports are compatible with Drizzle Kit's schema import format
3. Write a test that calls `getSchema()` and verifies the output shape matches Drizzle's expectations

---

## Data Model

### `_migrations` table (managed by Drizzle Kit)

| Column | Type | Notes |
|---|---|---|
| id | INTEGER | Primary key |
| hash | TEXT | Migration file hash |
| created_at | TEXT | ISO timestamp |

### `conversation_messages` table (created by Phase 5, included here for planning)

Not in scope for Phase 4 — Phase 5 defines this. Phase 4's QueryBuilder is what Phase 5 uses to query it.

## API Design

### Public exports from `@roost/orm`

```typescript
export { Model } from './model.ts';
export { Factory } from './factory.ts';
export { Seeder } from './seeder.ts';
export { OrmServiceProvider } from './provider.ts';
export type { PaginationResult } from './pagination.ts';
export type { HookEvent, HookListener } from './hooks.ts';
export type { Relation, HasOneRelation, HasManyRelation, BelongsToRelation, BelongsToManyRelation } from './relations.ts';
```

### Key type signatures

```typescript
// Model.where — column must be a key of the model's columns
User.where('email', 'test@example.com')          // QueryBuilder<typeof User>
User.where('createdAt', '>', '2025-01-01')        // QueryBuilder<typeof User>

// QueryBuilder terminal methods
await User.where('active', true).all()            // User[]
await User.where('active', true).first()          // User | null
await User.where('active', true).count()          // number
await User.where('active', true).paginate(1, 20)  // PaginationResult<User>

// Eager loading
await User.with('posts').all()                    // User[] (each has posts: Post[])
await User.with('posts.comments').all()           // User[] → Post[] → Comment[]

// Create / update
await User.create({ email: 'a@b.com', name: 'Ada' })  // User
await user.update({ name: 'Ada Lovelace' })            // User
await user.delete()                                    // void
```

## Testing Requirements

### Unit Tests

| Test File | Coverage |
|---|---|
| `packages/orm/__tests__/model.test.ts` | Schema derivation, instance proxy, static methods wire to QB |
| `packages/orm/__tests__/query-builder.test.ts` | All where variants, orderBy, limit/offset, terminal methods |
| `packages/orm/__tests__/relations.test.ts` | hasMany load, hasOne load, belongsTo load, N+1 prevention (query count assertions) |
| `packages/orm/__tests__/hooks.test.ts` | creating/created fire, creating returning false aborts, observer pattern |
| `packages/orm/__tests__/factory.test.ts` | definition, states, create/build, afterCreating, createMany |
| `packages/orm/__tests__/scopes.test.ts` | scopeActive callable as .active(), scope chaining |
| `packages/orm/__tests__/pagination.test.ts` | correct pages, lastPage, hasMorePages, from/to |

### MockD1Database

All tests use a `MockD1Database` that implements the `D1Database` interface and stores rows in memory. It records all SQL statements so tests can assert what queries were issued — essential for proving N+1 prevention.

```typescript
// packages/orm/__tests__/helpers/mock-d1.ts

export class MockD1Database implements D1Database {
  private tables = new Map<string, Record<string, unknown>[]>();
  readonly queries: string[] = [];

  prepare(query: string): D1PreparedStatement {
    this.queries.push(query);
    // ... returns a mock prepared statement that executes against this.tables
  }
}
```

### Key test cases

- **N+1 prevention**: Load 10 users with `User.with('posts').all()`. Assert `mockD1.queries.length === 2` (one for users, one for all posts).
- **Hook abort**: Register a `creating` hook that returns `false`. Call `User.create(...)`. Assert no row was inserted.
- **Scope chaining**: `User.active().admins().count()` produces SQL with both `WHERE active = 1 AND role = 'admin'`.
- **Factory states**: `new UserFactory().admin().unverified().create()` → user has `role: 'admin'` AND `active: false`.
- **Pagination**: 25 rows, `paginate(2, 10)` → `{ currentPage: 2, lastPage: 3, from: 11, to: 20, hasMorePages: true }`.

## Error Handling

| Error Scenario | Error Type | Message |
|---|---|---|
| `Model.find(id)` row not found and `findOrFail` called | `ModelNotFoundError` | `"User with id 42 not found"` |
| QueryBuilder used before ORM booted | `OrmNotBootedError` | `"User model is not connected to a database. Did you register OrmServiceProvider?"` |
| `.with('nonexistent')` called | `InvalidRelationError` | `"User has no relation named 'nonexistent'"` |
| Factory `create()` called without DB | `OrmNotBootedError` | Same as above |
| Drizzle query failure | `DatabaseQueryError` wrapping original | Includes original Drizzle error and the SQL statement |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
|---|---|---|---|---|
| Model registry | Model registered but `boot()` not called | OrmServiceProvider missing from app | All queries throw `OrmNotBootedError` | Clear error message points to missing provider |
| Query builder | N+1 queries | Relation accessed on instance without `.with()` | Slow responses, D1 rate limiting | Document pattern, add dev-mode warning on repeated relation queries |
| Factory | faker data collisions | `email: faker.internet.email()` generates duplicate | `UNIQUE constraint failed` on `create()` | Add faker seed reset in test helpers; use `faker.unique()` |
| Drizzle schema | Missing `__tests__` barrel export | Model not included in `OrmServiceProvider.models()` | Table doesn't exist at runtime | CLI `roost make:model` auto-adds to barrel |
| Migrations | Drizzle Kit schema mismatch | Manual DB edits outside migrations | Migration fails to apply | Document: never edit DB manually; use rollback |
| Soft deletes | Query includes soft-deleted rows | `.withTrashed()` not used correctly | Deleted data appears in results | Document: soft deletes require `withTrashed()` to see deleted |

## Validation Commands

```bash
# Type checking
bun run tsc --noEmit --filter '@roost/orm'

# Unit tests
bun test --filter packages/orm

# Build package
bun run build --filter '@roost/orm'

# Verify Drizzle schema export shape (run in a test project)
node -e "import('./app/models/index.ts').then(m => console.log(Object.keys(m)))"
```
