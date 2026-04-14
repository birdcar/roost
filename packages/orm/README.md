# @roostjs/orm

ActiveRecord-style ORM for Cloudflare D1, built on Drizzle. Models, relations, factories, lifecycle hooks, pagination, and first-class multi-tenant support.

Part of [Roost](https://roost.birdcar.dev) — the Laravel of Cloudflare Workers.

## Installation

```bash
bun add @roostjs/orm
```

## Quick Start

```ts
import { Model, ModelRegistry } from '@roostjs/orm';
import { text, integer } from 'drizzle-orm/sqlite-core';

class Post extends Model {
  static tableName = 'posts';
  static columns = {
    title: text('title').notNull(),
    body: text('body'),
    user_id: integer('user_id'),
  };
}

// Boot once at startup with your D1 binding
const registry = new ModelRegistry();
registry.register(Post);
registry.boot(env.DB);

// Query
const post = await Post.find(1);
const drafts = await Post.where('status', 'draft').orderBy('created_at', 'desc').all();
const page = await Post.where('user_id', userId).paginate(1, 20);
```

## Features

- `Model` base class with `find`, `findOrFail`, `all`, `create`, `save`, `delete`
- Chainable `QueryBuilder` with `where`, `orWhere`, `whereIn`, `whereNull`, `whereNotNull`, `orderBy`, `limit`, `offset`
- `paginate(page, perPage)` returns `{ data, total, perPage, currentPage, lastPage }`
- `HasManyRelation`, `HasOneRelation`, `BelongsToRelation` with eager loading via `.with()`
- Lifecycle hooks: `creating`, `created`, `updating`, `updated`, `deleting`, `deleted`
- Soft deletes via `static softDeletes = true`
- Automatic timestamps (`created_at`, `updated_at`)
- `Factory` base class with `make()`, `makeOne()`, `create()`, `createOne()`, and composable states
- Multi-tenant global scopes via `TenantScopeMiddleware` and `tenantColumn`
- `D1SessionHandle` for read-your-writes consistency after mutations

## API

### Model

```ts
// Static query methods
Post.find(id)                          // InstanceType | null
Post.findOrFail(id)                    // InstanceType | throws ModelNotFoundError
Post.all()                             // InstanceType[]
Post.where(column, value)              // QueryBuilder
Post.where(column, op, value)          // QueryBuilder — ops: =, !=, >, >=, <, <=, like, in
Post.whereIn(column, values)           // QueryBuilder
Post.create(attrs)                     // InstanceType
Post.on(event, fn)                     // register lifecycle hook
Post.withoutTenantScope(fn)            // run fn bypassing tenant filter

// Instance methods
post.save()                            // update in DB
post.delete()                          // hard delete (or soft if softDeletes = true)
post.attributes                        // raw attribute map; properties also accessible directly
```

### QueryBuilder

```ts
Post.where('status', 'active')
  .whereNotNull('published_at')
  .orderBy('created_at', 'desc')
  .limit(10)
  .paginate(page, perPage)

// Terminal methods
.all()           // InstanceType[]
.first()         // InstanceType | null
.firstOrFail()   // InstanceType | throws
.count()         // number
.paginate(page, perPage)  // PaginationResult<InstanceType>
```

### Relations

```ts
import { HasManyRelation, BelongsToRelation } from '@roostjs/orm';

class User extends Model {
  posts() { return new HasManyRelation(Post, 'user_id'); }
}

const relation = new HasManyRelation(Post, 'user_id', 'id');
await relation.load(user);          // Post[]
await relation.loadMany(users);     // attaches posts[] to each user
```

### Factory

```ts
class PostFactory extends Factory<typeof Post> {
  constructor() { super(Post); }
  definition() {
    return { title: 'Test post', status: 'draft' };
  }
}

const factory = new PostFactory();
const post = await factory.makeOne();
const posts = await factory.count(5).state(a => ({ ...a, status: 'published' })).create();
```

### Multi-tenancy

```ts
import { TenantScopeMiddleware, TenantContext } from '@roostjs/orm';

// Set tenantColumn on any model to enable automatic scoping
class Post extends Model {
  static tenantColumn = 'org_id';
}

// TenantScopeMiddleware resolves org from request and sets context
const middleware = new TenantScopeMiddleware(resolver, orgLookup, tenantContext);
```

### D1 Sessions

```ts
import { D1SessionHandle } from '@roostjs/orm';

const session = new D1SessionHandle(env.DB);
await db.insert(...);
session.markWritten();                    // subsequent reads use session token
const d1 = session.sessionAwareRaw();     // D1Database with withSession() applied
```

## Documentation

Full documentation at [roost.birdcar.dev/docs/reference/orm](https://roost.birdcar.dev/docs/reference/orm)

## License

MIT
