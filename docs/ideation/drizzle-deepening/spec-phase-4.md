# Phase 4: Documentation Update

**Effort**: S (0.5-1 day)
**Blocked by**: Phase 2, Phase 3
**Status**: Ready to implement after Phase 2 + Phase 3

## Problem

All ORM documentation describes the old `static columns = {}` pattern that no longer exists. The migrations guide references a `roost make:migration` command that was never implemented and describes a custom `.up()/.down()` API that was replaced. The concepts and reference files don't mention Drizzle's relational API, `relations()`, `Model.query()`, or `Model.drizzle()`.

## Goal

All docs accurately describe the post-Phase-2/3 APIs. Generated LLM files (`llms.txt`, `llms-full.txt`, `.md.txt` files) are rebuilt. The `@roost/skills` conventions file is updated so AI tools give correct guidance.

## Files Changed

| File | Change |
|------|--------|
| `apps/site/content/docs/reference/orm.mdx` | Add `query()`, `drizzle()`, `relations()`, remove `static columns` |
| `apps/site/content/docs/guides/orm.mdx` | New model pattern, relations declaration, eager loading |
| `apps/site/content/docs/guides/migrations.mdx` | Replace custom `.up()/.down()` API with `roost migrate:generate` + `roost migrate` |
| `apps/site/content/docs/concepts/orm.mdx` | Explain relational API, Drizzle-first approach |
| `apps/site/content/docs/getting-started.mdx` | Update model creation steps |
| `apps/site/content/docs/reference/cli.mdx` | Add `migrate:rollback`, `migrate:status`, `--remote` flag |
| `packages/roost-skills/src/skills/roost-conventions.ts` | Update conventions content |
| `apps/site/dist/client/` | Rebuild via `bun run --filter roost-site build` |

## Implementation

This is pure content editing — no code logic changes. Work through each file sequentially.

### `apps/site/content/docs/reference/orm.mdx`

**Remove**: `static columns` property documentation. The section describing how to define columns via `static columns = {}` is replaced by the `sqliteTable()` pattern.

**Add** these sections:

**`static _table: SQLiteTableWithColumns`**
The Drizzle table definition. Set this to the `sqliteTable()` export from the same file. Required — the ORM will throw `OrmNotBootedError` at boot if `_table` is `null`.

**`static query(): QueryBuilder`**
Returns a new `QueryBuilder` backed by Drizzle's relational API when `.with()` is used. Equivalent to `Model.where()` but reads more clearly when starting with `.with()`.

**`static drizzle(): DrizzleD1Database`**
Returns the raw Drizzle database instance. Use for complex queries that the `QueryBuilder` cannot express — joins, CTEs, subqueries, prepared statements.

**`QueryBuilder.orWhere()` operator overload**
Document the new two-form signature matching `where()`:
- `orWhere(column, value)` — equality check
- `orWhere(column, op, value)` — comparison with operator

**`QueryBuilder.with(...relations: string[])`**
Document that this now delegates to `db.query.{table}.findMany({ with: {...} })`. Requires the model's `relations()` to be registered with `ModelRegistry`.

**Remove** documentation for `HasManyRelation`, `HasOneRelation`, `BelongsToRelation` classes — replaced by Drizzle's `relations()` function.

**Add** documentation for `relations()` re-export from `@roost/orm`:
```ts
import { relations } from '@roost/orm';

export const usersRelations = relations(users, ({ many, one }) => ({
  posts: many(posts),
}));
```

### `apps/site/content/docs/guides/orm.mdx`

**Replace "How to define a model"** with the new static schema pattern:

```ts src/models/user.ts
import { Model, relations } from '@roost/orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
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

**Replace "How to define relationships"** section. Remove the `HasManyRelation`, `HasOneRelation`, `BelongsToRelation` examples. Add:

**Defining relations**:
```ts src/models/post.ts
import { Model, relations } from '@roost/orm';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { users } from './user.js';

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  user_id: integer('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  created_at: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updated_at: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const postsRelations = relations(posts, ({ one }) => ({
  user: one(users, { fields: [posts.user_id], references: [users.id] }),
}));

export class Post extends Model {
  static tableName = 'posts';
  static _table = posts;
}
```

**Registering models with relations**:
```ts src/app.ts
import { OrmServiceProvider } from '@roost/orm';
import { User, usersRelations } from './models/user.js';
import { Post, postsRelations } from './models/post.js';

new OrmServiceProvider(app)
  .withModels([
    [User, usersRelations],
    [Post, postsRelations],
  ])
  .register();
```

**Eager loading with `.with()`**:
```ts
// Single query — no N+1
const users = await User.query().with('posts').all();

// Access loaded relation (type is unknown — cast as needed)
for (const user of users) {
  const posts = (user as any).posts as Post[];
}
```

**Add "How to drop to raw Drizzle"** section:
```ts
import { users } from '../models/user.js';
import { posts } from '../models/post.js';
import { eq, count } from 'drizzle-orm';

// Raw Drizzle for complex queries
const usersWithPostCount = await User.drizzle()
  .select({
    id: users.id,
    name: users.name,
    postCount: count(posts.id),
  })
  .from(users)
  .leftJoin(posts, eq(users.id, posts.user_id))
  .groupBy(users.id);
```

### `apps/site/content/docs/guides/migrations.mdx`

**Rewrite entirely.** The current content describes a `roost make:migration` command and a custom `.up()/.down()` TypeScript API that was never shipped. Replace with the Drizzle-based workflow.

**New structure**:

**How to generate a migration**

Define your model schema using `sqliteTable()`, then run:
```terminal
roost migrate:generate
```
This runs `drizzle-kit generate` which diffs your static schema against existing migration files and writes a new `.sql` file to `database/migrations/`.

**How to apply pending migrations**

```terminal
roost migrate
```
Applies all pending `.sql` files in `database/migrations/` in order, recording each in the `_migrations` table. Safe to run multiple times — already-applied migrations are skipped.

**How to check migration status**

```terminal
roost migrate:status
```
Lists all migration files with `[applied]` or `[pending]` status.

**How to roll back the last batch**

```terminal
roost migrate:rollback
```
Reverts the last batch of applied migrations. Requires `.down.sql` sibling files (drizzle-kit does not generate these — write them manually).

**How to run migrations in production**

```terminal
roost migrate --remote
```
Applies pending migrations against the remote D1 database via wrangler. Run this as part of your deployment pipeline.

**Typical workflow**

```terminal
# 1. Edit your model schema (sqliteTable definition)
# 2. Generate migration SQL
roost migrate:generate

# 3. Review the generated SQL in database/migrations/
# 4. Apply it locally
roost migrate

# 5. On deploy
roost migrate --remote
```

### `apps/site/content/docs/concepts/orm.mdx`

**Update** to describe the Drizzle-first approach:

- Models are thin wrappers around static Drizzle `sqliteTable()` exports
- The relational API (`db.query`) provides type-safe eager loading without N+1
- The `QueryBuilder` is a Laravel-style facade over Drizzle's query builder
- `Model.drizzle()` exposes raw Drizzle for queries that exceed the facade
- Relations use Drizzle's `relations()` function — not custom classes

**Remove** any mention of `static columns`, `HasManyRelation`, etc.

### `apps/site/content/docs/getting-started.mdx`

Find the "Create a model" step (around Step 5-6 in the current file). Update it to show the new `sqliteTable()` + class pattern instead of the old `static columns = {}` pattern.

Also update any mention of `roost migrate` in the getting started flow to show the two-step workflow:
```terminal
roost migrate:generate
roost migrate
```

### `apps/site/content/docs/reference/cli.mdx`

Find the `migrate` and `migrate:generate` entries. Add:
- `migrate:rollback` — Revert last migration batch. Use `--remote` for production.
- `migrate:status` — Show applied and pending migrations.
- Document the `--remote` flag on `migrate` and `migrate:rollback`.

### `packages/roost-skills/src/skills/roost-conventions.ts`

Find the ORM conventions section. Update to reflect:

1. Models export `sqliteTable()` as a named export alongside the class:
   ```ts
   export const users = sqliteTable('users', { ... });
   export class User extends Model { static _table = users; }
   ```

2. Relations use `relations()` from `@roost/orm` (re-exported from drizzle-orm):
   ```ts
   export const usersRelations = relations(users, ({ many }) => ({ posts: many(posts) }));
   ```

3. Register models with their relations:
   ```ts
   registry.register(User, usersRelations);
   ```

4. Eager loading uses `.with()` on `QueryBuilder`, backed by `db.query`:
   ```ts
   const users = await User.query().with('posts').all();
   ```

5. Raw Drizzle is available via `Model.drizzle()` for complex queries.

6. Migration workflow: `roost migrate:generate` → review SQL → `roost migrate`.

## Rebuild Generated Files

After editing all MDX content, rebuild the site to regenerate `llms.txt`, `llms-full.txt`, and all `.md.txt` files:

```bash
bun run --filter roost-site build
```

Verify the build succeeds with no errors. The generated files in `apps/site/dist/client/` are committed alongside the MDX source.

## Validation

```bash
# Build the site — this also runs the prebuild script that generates llms.txt
bun run --filter roost-site build

# Should exit 0 with no errors
```

No other automated tests exist for documentation content. Manual review: read through each updated section to confirm code examples match the actual post-Phase-3 API.

## Checklist

- [ ] `reference/orm.mdx` — no mention of `static columns`, `HasManyRelation`, `HasOneRelation`, `BelongsToRelation`
- [ ] `reference/orm.mdx` — documents `query()`, `drizzle()`, `relations()`, `with()` real behavior
- [ ] `guides/orm.mdx` — model template shows `sqliteTable()` + `relations()` + class
- [ ] `guides/orm.mdx` — eager loading section shows `.with()` and its requirements
- [ ] `guides/migrations.mdx` — no `make:migration`, no `.up()/.down()` TypeScript API
- [ ] `guides/migrations.mdx` — documents `migrate:generate` → `migrate` workflow
- [ ] `guides/migrations.mdx` — documents `migrate:rollback`, `migrate:status`, `--remote` flag
- [ ] `concepts/orm.mdx` — describes Drizzle-first, relational API, facade pattern
- [ ] `getting-started.mdx` — model creation step uses new pattern
- [ ] `reference/cli.mdx` — all 4 migrate commands documented
- [ ] `roost-conventions.ts` — ORM section updated
- [ ] `bun run --filter roost-site build` passes
