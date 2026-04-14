# ORM Documentation Audit — Fix Report

Audited against source in `packages/orm/src/` and `packages/schema/src/`.

---

## `apps/site/content/docs/reference/orm.mdx`

### `static tableName` — incorrect "Required" claim
**Before:** Documented as required.
**After:** `static tableName: string | null` — defaults to `null`; the ORM derives the table name via `toTableName()` (e.g. `PostComment` → `post_comments`). Setting it explicitly overrides auto-derivation.

### `static async all()` — wrong return type description
**Before:** "Returns a `QueryBuilder` for chaining."
**After:** Returns `Promise<T[]>` directly. No chaining.

### `save()` — wrong return type
**Before:** `async save(): Promise<void>`
**After:** `async save(): Promise<this>` — returns the instance.

### Missing `static whereIn` in Static Query Methods
`Model.whereIn(column, values)` exists in source but was absent from the reference. Added.

### Missing `with()` in QueryBuilder API
`QueryBuilder.with(...relations: string[])` exists in source but was absent. Added.

### Relationships — entirely wrong API
**Before:** Documented as static method calls: `static hasOne(Model, fk, lk)`, `static hasMany(...)`, `static belongsTo(...)`, `static belongsToMany(...)`.
**After:** Relationships are classes — `HasOneRelation`, `HasManyRelation`, `BelongsToRelation` — instantiated as static properties. Usage is `Relation.load(instance)` / `Relation.loadMany(instances)`.

### `belongsToMany` — does not exist
`BelongsToManyRelation` is not implemented in source. Removed from docs.

### Factory API — wrong method names and signature
**Before:** `abstract define()`, `create(overrides?)`, `make(overrides?)` (both accepting optional overrides, `make` synchronous).
**After:**
- Abstract method is `definition()` (not `define()`).
- No overrides parameter on any method. Use `.state(modifier)` to apply overrides.
- Methods: `make(): Promise<T[]>`, `makeOne(): Promise<T>`, `create(): Promise<T[]>`, `createOne(): Promise<T>`. All async.
- Count is set via `.count(n)` chained before the terminal method.
- `Factory` is abstract — must be subclassed, cannot be instantiated directly with a callback.

### `Seeder` class — does not exist
`Seeder` is not exported from `@roostjs/orm` (or any package). Removed from reference.

### Missing errors: `OrmNotBootedError`, `InvalidRelationError`
Both are exported from `@roostjs/orm` but were absent from the Errors section. Added.

### Types section — wrong type names
**Before:** `type Operator`, `type LifecycleEvent`.
**After:** Actual exported types are `HookName` and `HookFn` (not `LifecycleEvent`). `Operator` is not an exported type — it is an internal concept. Updated types section to match actual exports.

---

## `apps/site/content/docs/guides/orm.mdx`

### Migration example — `Migration` class does not exist
**Before:** `import { Migration } from '@roostjs/orm'` with a class extending `Migration`.
**After:** Removed the inline migration example and replaced with a brief callout to the migrations guide. `Migration` is not exported from any package.

### `Seeder` import — does not exist
**Before:** `import { Seeder } from '@roostjs/orm'`.
**After:** Removed the seeder section entirely. `Seeder` is not exported from any package.

### Relationship syntax — wrong API
**Before:** `static hasMany(Post, 'author_id', 'id')` etc. (static method calls).
**After:** Replaced with correct relation class instantiation (`HasManyRelation`, `HasOneRelation`, `BelongsToRelation`) assigned to static properties, with `load(instance)` call pattern.

### Factory example — wrong constructor and API
**Before:** `new Factory(Post, () => ({...}))` with two-arg constructor, `create({ status: 'published' })` with overrides.
**After:** Subclass with `definition()` method; overrides via `.state(modifier)`; `createOne()` / `count(n).create()` pattern.

---

## `apps/site/content/docs/concepts/orm.mdx`

### QueryBuilder described as immutable — incorrect
**Before:** "Each method returns a new `QueryBuilder` instance, so chains are immutable."
**After:** Methods mutate and return `this`. Chains are stateful. Clarified that a fresh `QueryBuilder` is obtained from a static model method per query.

### Missing QueryBuilder methods in description
Added `whereNull`, `whereNotNull`, `offset`, `firstOrFail()` to the method list in the concept overview.

### Broken internal link
**Before:** `/docs/packages/orm`
**After:** `/docs/reference/orm`

### Link description mentions "migration API"
Updated to "factory API" since migrations are not part of `@roostjs/orm`.

---

## `apps/site/content/docs/guides/migrations.mdx`

### `Migration` class used throughout — does not exist
**Before:** All migration examples import and extend `Migration` from `@roostjs/orm`, using `this.db.run(sql)`.
**After:** Migrations export a plain object with `up(db: D1Database)` and `down(db: D1Database)` methods that call `db.prepare(sql).run()` directly against the D1 binding. No `Migration` base class exists in any package.

### `wrangler d1 execute --file=...ts` — invalid wrangler usage
**Before:** `wrangler d1 execute my-app-db --remote --file=...ts` (TypeScript file passed directly).
**After:** `wrangler d1 migrations apply my-app-db --remote` (correct wrangler migrations command).

### Index example — `this.db.run()` replaced with direct `db.prepare().run()`
Updated all `this.db.run(sql)` calls to match the plain-object migration shape.

---

## `packages/schema/` — not a migration schema builder

`packages/schema/src/builder.ts` exports a **JSON Schema builder** (`schema.string()`, `schema.object()`, etc.) used for AI tool definitions and input validation. It has no relation to database migrations or DDL. The spec note about "schema builder as primary API for migrations" does not apply — no such tool exists in this codebase. Raw D1 SQL is the correct and only migration API.
