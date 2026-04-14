# PRD: Roost Framework - Phase 4

**Contract**: ./contract.md
**Phase**: 4 of 11
**Focus**: Drizzle-based ORM with Laravel-like model classes, migrations, and query builder

## Phase Overview

Phase 4 gives Roost its data layer. Rather than building an ORM from scratch, Roost wraps Drizzle — which already has D1 support — in a Laravel-inspired model layer. Developers define models as classes, get typed relationships, run migrations, and use a query builder that feels like Eloquent but compiles to Drizzle's typed SQL.

This phase depends on Phase 1 (D1 binding) but not on Phase 2 or 3. It runs in parallel with Router and Auth. Models don't need routes to exist — they're pure data layer. However, Phase 7 (Billing) depends on this phase for the Customer model pattern.

After this phase, a developer can define `class User extends Model`, declare relationships (`hasMany(Post)`), generate and run migrations, seed test data, and query with a fluent builder — all against D1.

## User Stories

1. As a Roost app developer, I want to define models as TypeScript classes so that my data layer has clear structure and type safety.
2. As a Roost app developer, I want migrations generated from my model definitions so that schema changes are tracked and reproducible.
3. As a Roost app developer, I want a query builder that feels like Eloquent so that I can write expressive queries without raw SQL.
4. As a Roost app developer, I want model relationships so that I can define hasMany, belongsTo, and many-to-many without manual joins.
5. As a Roost app developer, I want model factories and seeders so that I can generate test data quickly.
6. As a Roost app developer, I want model events/hooks so that I can run logic on create, update, and delete.

## Functional Requirements

### Model Base Class (@roostjs/orm)

- **FR-4.1**: `Model` base class that wraps a Drizzle table definition
- **FR-4.2**: Models define schema as static properties (column definitions with types)
- **FR-4.3**: Automatic `id`, `createdAt`, `updatedAt` columns unless opted out
- **FR-4.4**: Model instances are typed — `user.email` has correct type from schema
- **FR-4.5**: Models register with the service container for DI access

### Drizzle Integration

- **FR-4.6**: Drizzle schema auto-generated from Model class definitions
- **FR-4.7**: D1 adapter configured automatically from @roostjs/cloudflare D1 binding
- **FR-4.8**: Raw Drizzle access available for escape-hatch queries

### Query Builder

- **FR-4.9**: Fluent query builder: `User.where('email', email).first()`
- **FR-4.10**: Chainable conditions: `.where()`, `.orWhere()`, `.whereIn()`, `.whereNull()`
- **FR-4.11**: Ordering and pagination: `.orderBy('createdAt', 'desc')`, `.paginate(page, perPage)`
- **FR-4.12**: Aggregates: `.count()`, `.sum('amount')`, `.avg('score')`
- **FR-4.13**: Eager loading: `User.with('posts', 'posts.comments').all()`
- **FR-4.14**: Scopes: model-level reusable query fragments (e.g., `User.active()` = `.where('active', true)`)

### Relationships

- **FR-4.15**: `hasOne(related, foreignKey?)` — one-to-one
- **FR-4.16**: `hasMany(related, foreignKey?)` — one-to-many
- **FR-4.17**: `belongsTo(related, foreignKey?)` — inverse one-to-one/many
- **FR-4.18**: `belongsToMany(related, pivotTable, foreignKey?, relatedKey?)` — many-to-many
- **FR-4.19**: Relationships typed — `user.posts` returns `Post[]`, `post.author` returns `User`

### Migrations

- **FR-4.20**: Migration files generated from model schema diffs (Drizzle Kit integration)
- **FR-4.21**: Migration runner executes against D1 via Wrangler
- **FR-4.22**: Migration history tracked in a `_migrations` table
- **FR-4.23**: Rollback support for the last migration batch

### Seeding & Factories

- **FR-4.24**: Factory classes define how to generate fake model instances
- **FR-4.25**: Seeder classes compose factories for database population
- **FR-4.26**: Factories support states: `UserFactory.admin()`, `UserFactory.unverified()`
- **FR-4.27**: Factories generate valid related data: `UserFactory.withPosts(3)`

### Model Events

- **FR-4.28**: Lifecycle hooks: `creating`, `created`, `updating`, `updated`, `deleting`, `deleted`
- **FR-4.29**: Hooks defined as model methods or external observers
- **FR-4.30**: Hooks receive the model instance and can modify or abort the operation

## Non-Functional Requirements

- **NFR-4.1**: Query builder produces optimized SQL — no N+1 queries with eager loading
- **NFR-4.2**: Model instantiation overhead < 1ms per instance
- **NFR-4.3**: Migration generation runs in < 5 seconds
- **NFR-4.4**: All query builder methods preserve full TypeScript type inference

## Dependencies

### Prerequisites

- Phase 1 complete (D1 binding from @roostjs/cloudflare, service container)

### Outputs for Next Phase

- Model base class for Phase 7 Billing's Customer/Subscription models
- Query builder for Phase 5 AI's conversation persistence
- Factory/seeder pattern for Phase 9 Testing utilities
- Migration infrastructure for Phase 8 CLI's `roost migrate` command

## Acceptance Criteria

- [ ] A model class with typed columns compiles and maps to a Drizzle table
- [ ] `User.create({ email, name })` inserts a row and returns a typed model instance
- [ ] `User.where('email', email).first()` returns the correct row or null
- [ ] `user.posts` (hasMany) returns related Post instances
- [ ] `post.author` (belongsTo) returns the related User instance
- [ ] Eager loading with `.with('posts')` eliminates N+1 queries
- [ ] Migration generation detects schema changes and creates SQL migration
- [ ] Migration runner applies and tracks migrations in D1
- [ ] Factory generates fake model instances with correct types
- [ ] Model events fire on create, update, and delete
- [ ] Query builder pagination returns correct pages with metadata
- [ ] All public APIs have full TypeScript type inference (no `any`)
