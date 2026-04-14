# Implementation Spec: CF Platform Completeness - Phase 6

**Contract**: ./contract.md
**Estimated Effort**: L

## Technical Approach

Phase 6 adds three layered capabilities to the Roost ORM and auth stack: automatic tenant-scoped query filtering, database-per-tenant routing, and D1 Sessions API integration. Each is independently opt-in so teams can adopt them incrementally.

**Layer 1 — Row-level isolation (tenant-scoped query filtering)**: The most common case. A `TenantContext` singleton is populated per-request by a `TenantScopeMiddleware` that calls `OrgResolver`. When `Model.tenantColumn` is set, `QueryBuilder` prepends a `where tenantColumn = currentOrgId` condition before executing any read, insert, update, or delete. Models without `tenantColumn` are global (plans, system config). An escape hatch — `Model.withoutTenantScope(fn)` — is available for admin operations.

**Layer 2 — Database-per-tenant routing**: For customers who need hard isolation. `TenantDatabaseResolver` computes the D1 binding name from the resolved org slug using a configurable pattern (default `DB_TENANT_{SLUG}`). `OrmServiceProvider` detects `database.tenantStrategy: 'database'` at boot time and, when present, resolves the per-tenant binding instead of the shared `DB` binding. Falls back to shared DB when no per-tenant binding exists, enabling a tiered model where some tenants get their own database and others share.

**Layer 3 — D1 Sessions API**: Cloudflare D1 supports `withSession()` to guarantee read-your-writes consistency across replicas. When `database.useSession: true`, a `D1SessionHandle` wraps the raw D1 binding and calls `.withSession()` before handing it to Drizzle. After any write (create, save, delete), the session token is retained on the handle so subsequent reads in the same request use the same session.

The three layers compose without conflict: a tenant-scoped database-per-tenant model that uses sessions is possible by combining all three configs.

**Context threading**: All three layers depend on per-request state. Phase 1 established `ExecutionContext` threading through `Application`. Phase 6 uses that same mechanism — `TenantContext` is a request-scoped container value, not a module-level singleton, so it is safe in the Worker's single-threaded concurrent execution model.

## Feedback Strategy

**Inner-loop command**: `bun test --filter orm && bun test --filter auth`

**Playground**: All behavior is exercised with in-memory Drizzle (using `drizzle({ schema })` with a mock D1 adapter from the existing test helpers). No real D1 binding is needed. The `TenantContext` is injected directly in tests. The D1 session mock records `.withSession()` calls and exposes them for assertion.

**Why this approach**: The ORM already has a full fake/mock infrastructure from Phase 1. Tenant filtering is pure where-clause injection — entirely testable in-process. The session token flow is also fully mockable since it is just a string returned from a mock `.withSession()` call.

## File Changes

### New Files

| File Path | Purpose |
|---|---|
| `packages/orm/src/tenant-context.ts` | Per-request tenant state container — holds resolved org ID and bypass flag |
| `packages/orm/src/tenant-resolver.ts` | `TenantDatabaseResolver` — maps org slug to D1 binding name |
| `packages/orm/src/d1-session.ts` | `D1SessionHandle` — wraps raw D1 binding with `withSession()` lifecycle |
| `packages/orm/src/tenant-middleware.ts` | `TenantScopeMiddleware` — resolves org via OrgResolver, sets TenantContext |
| `packages/orm/__tests__/tenant-filter.test.ts` | Auto-filter injection, bypass, unscoped models |
| `packages/orm/__tests__/tenant-routing.test.ts` | Database-per-tenant resolver, fallback to shared DB |
| `packages/orm/__tests__/d1-session.test.ts` | Session handle, post-write token retention, read reuse |

### Modified Files

| File Path | Change |
|---|---|
| `packages/orm/src/model.ts` | Add `tenantColumn`, `_tenantContext`, `withoutTenantScope()`, update `find`, `all`, `create`, `save`, `delete` to honour tenant column; pass context to `QueryBuilder` |
| `packages/orm/src/provider.ts` | Read `database.tenantStrategy` config; branch boot logic for `'database'` strategy using `TenantDatabaseResolver`; apply `D1SessionHandle` when `database.useSession: true` |
| `packages/orm/src/errors.ts` | Add `TenantNotResolvedError`, `TenantBindingNotFoundError` |
| `packages/cloudflare/src/bindings/d1.ts` | Add `withSession(token?: string): D1SessionHandle` method; export `D1SessionHandle` type |
| `packages/auth/src/org.ts` | No structural change — used as-is by `TenantScopeMiddleware` |

## Implementation Details

### 1. TenantContext

**Overview**: A lightweight value object stored as a request-scoped container binding. Contains the resolved org ID (after DB lookup), a bypass flag, and optionally the resolved slug.

```typescript
// packages/orm/src/tenant-context.ts

export interface TenantContextData {
  orgId: string;
  orgSlug: string;
}

export class TenantContext {
  private data: TenantContextData | null = null;
  private bypassed = false;

  set(data: TenantContextData): void {
    this.data = data;
  }

  get(): TenantContextData | null {
    return this.data;
  }

  isBypassed(): boolean {
    return this.bypassed;
  }

  bypass(): void {
    this.bypassed = true;
  }

  restore(): void {
    this.bypassed = false;
  }
}
```

`TenantContext` is registered as a scoped binding in `OrmServiceProvider.register()` so each request gets a fresh instance. The provider resolves it from the container when needed; it is never imported as a module-level singleton.

### 2. Model Changes

**Static properties added to `Model`**:

```typescript
static tenantColumn: string | null = null;
static _tenantContext: TenantContext | null = null;
```

`tenantColumn` defaults to `null`, making the base class unscoped. Subclasses opt in:

```typescript
export class Post extends Model {
  static tenantColumn = 'org_id';
}
```

**`withoutTenantScope(fn)` escape hatch**:

```typescript
static async withoutTenantScope<T>(fn: () => Promise<T>): Promise<T> {
  const ctx = this._tenantContext;
  if (ctx) ctx.bypass();
  try {
    return await fn();
  } finally {
    if (ctx) ctx.restore();
  }
}
```

**`find`, `all`, `create`, `save`, `delete` changes**: Each calls a private `ensureTenantFilter(attrs?)` method before executing. For `create`, the tenant column value is injected into `attrs` automatically if not already present. For `save` and `delete`, the tenant column is added to the `where` clause.

The static `where` and `whereIn` methods on `Model` pass `this._tenantContext` to the `QueryBuilder` constructor.

**`QueryBuilder` change**: Constructor accepts an optional `TenantContext`. In `execute()` and `count()`, if the context is active (not null, not bypassed) and `modelClass.tenantColumn` is non-null, a tenant `where` condition is prepended to `this.wheres` before building the clause. The prepended condition is not stored in `this.wheres` permanently — it is composed at query execution time so chained `.where()` calls remain unaffected.

```typescript
// Inside QueryBuilder.execute() — before buildWhereClause
private resolveTenantCondition(): { type: 'and'; column: string; op: '='; value: unknown } | null {
  const col = (this.modelClass as any).tenantColumn as string | null;
  const ctx = this.tenantContext;
  if (!col || !ctx || ctx.isBypassed()) return null;
  const data = ctx.get();
  if (!data) return null;
  return { type: 'and', column: col, op: '=', value: data.orgId };
}
```

The tenant condition, when present, is passed as the first element to `buildWhereClause`, guaranteeing it is always the outermost `and` condition.

### 3. TenantScopeMiddleware

**Overview**: Request-scoped middleware that runs early in the stack — after auth, before route handlers. Calls `OrgResolver.resolve(request)` to get the slug, then looks up the org record in the DB to get the canonical `org_id`, and sets it on `TenantContext`.

```typescript
// packages/orm/src/tenant-middleware.ts

export class TenantScopeMiddleware {
  constructor(
    private resolver: OrgResolver,
    private orgLookup: (slug: string) => Promise<{ id: string } | null>,
    private ctx: TenantContext,
  ) {}

  async handle(request: Request, next: () => Promise<Response>): Promise<Response> {
    const resolved = this.resolver.resolve(request);
    if (resolved) {
      const org = await this.orgLookup(resolved.slug);
      if (!org) throw new TenantNotResolvedError(resolved.slug);
      this.ctx.set({ orgId: org.id, orgSlug: resolved.slug });
    }
    return next();
  }
}
```

`orgLookup` is provided by the application — typically a call to an `Organization` model via `withoutTenantScope` to avoid circularity. The middleware does not hard-code the model class.

### 4. TenantDatabaseResolver

**Overview**: Maps an org slug to a D1 binding name and resolves it from the container.

```typescript
// packages/orm/src/tenant-resolver.ts

export class TenantDatabaseResolver {
  constructor(
    private pattern: string = 'DB_TENANT_{SLUG}',
    private resolveBinding: (name: string) => D1Database | null,
  ) {}

  resolve(slug: string): D1Database | null {
    const bindingName = this.pattern.replace('{SLUG}', slug.toUpperCase().replace(/-/g, '_'));
    return this.resolveBinding(bindingName);
  }
}
```

`resolveBinding` is a closure over the container. If the binding is not found, `resolve` returns `null` and `OrmServiceProvider` falls back to the shared `database.d1Binding`.

Config:

```typescript
// wrangler.jsonc
{
  "database": {
    "tenantStrategy": "database",      // 'row' (default) | 'database'
    "tenantBindingPattern": "DB_TENANT_{SLUG}",
    "d1Binding": "DB",
    "useSession": false
  }
}
```

### 5. OrmServiceProvider Boot Changes

The boot method branches based on `database.tenantStrategy`:

```typescript
async boot(): Promise<void> {
  const registry = this.app.container.resolve(ModelRegistry);
  const strategy = this.app.config.get('database.tenantStrategy', 'row');
  const useSession = this.app.config.get('database.useSession', false);
  const d1BindingName = this.app.config.get('database.d1Binding', 'DB');

  let rawD1: globalThis.D1Database;

  if (strategy === 'database') {
    const tenantCtx = this.app.container.resolve(TenantContext);
    const orgSlug = tenantCtx.get()?.orgSlug ?? null;

    if (orgSlug) {
      const pattern = this.app.config.get('database.tenantBindingPattern', 'DB_TENANT_{SLUG}');
      const resolver = new TenantDatabaseResolver(pattern, (name) => {
        try { return this.app.container.resolve<D1Database>(name); }
        catch { return null; }
      });
      const tenantD1 = resolver.resolve(orgSlug);
      rawD1 = (tenantD1 ?? this.app.container.resolve<D1Database>(d1BindingName)).raw;
    } else {
      rawD1 = this.app.container.resolve<D1Database>(d1BindingName).raw;
    }
  } else {
    rawD1 = this.app.container.resolve<D1Database>(d1BindingName).raw;
  }

  if (useSession) {
    const sessionHandle = new D1SessionHandle(rawD1);
    registry.boot(sessionHandle.sessionAwareRaw());
  } else {
    registry.boot(rawD1);
  }

  // Inject TenantContext into all registered model classes
  const ctx = this.app.container.resolve(TenantContext);
  for (const [, modelClass] of registry.getModels()) {
    (modelClass as any)._tenantContext = ctx;
  }
}
```

Note: `OrmServiceProvider.boot()` is called per-request in the Worker fetch handler (via `app.boot()`), so resolving `TenantContext` here gives the current request's context.

### 6. D1SessionHandle

**Overview**: Wraps a raw `D1Database` binding and manages the session lifecycle. On first use after a write, calls `db.withSession(token)` (or `db.withSession()` for a fresh session) and stores the returned token. Subsequent calls to `sessionAwareRaw()` return the session-pinned handle.

```typescript
// packages/orm/src/d1-session.ts

export class D1SessionHandle {
  private sessionToken: string | undefined = undefined;
  private db: globalThis.D1Database;

  constructor(db: globalThis.D1Database) {
    this.db = db;
  }

  sessionAwareRaw(): globalThis.D1Database {
    if (this.sessionToken !== undefined) {
      return this.db.withSession(this.sessionToken) as unknown as globalThis.D1Database;
    }
    return this.db;
  }

  markWritten(token?: string): void {
    this.sessionToken = token ?? '__first_unconditional__';
  }
}
```

After each write in `Model.create`, `Model.save`, and `Model.delete`, the ORM calls `sessionHandle.markWritten()`. `markWritten` without a token uses a sentinel that triggers `.withSession()` with no argument on the next read, which CF interprets as "start a new session". If CF returns a session token in the write response headers, that token is captured and passed explicitly.

The `D1Database` wrapper in `packages/cloudflare/src/bindings/d1.ts` gains a `withSession(token?: string)` method that delegates to `this.db.withSession(token)` and returns a new `D1Database` wrapping the session-pinned handle.

### 7. Error Types

```typescript
// packages/orm/src/errors.ts additions

export class TenantNotResolvedError extends Error {
  constructor(slug: string) {
    super(`Tenant "${slug}" could not be resolved to an organization.`);
    this.name = 'TenantNotResolvedError';
  }
}

export class TenantBindingNotFoundError extends Error {
  constructor(bindingName: string) {
    super(
      `No D1 binding found for "${bindingName}". ` +
      'Add it to wrangler.jsonc [[d1_databases]] or fall back to shared DB.'
    );
    this.name = 'TenantBindingNotFoundError';
  }
}
```

## Testing Requirements

### Tenant Filtering Tests (`packages/orm/__tests__/tenant-filter.test.ts`)

- A model with `tenantColumn = 'org_id'` auto-prepends `where org_id = '<id>'` on `.all()`
- A model with `tenantColumn = 'org_id'` auto-prepends tenant filter on `.where('status', 'active').all()`
- A model with `tenantColumn = 'org_id'` auto-prepends tenant filter on `.find(id)`
- `create()` injects `org_id` into attrs when `tenantColumn` is set and context is active
- `save()` fails if attempting to update a record with a different `org_id` than context (row-level guard)
- `delete()` scopes the delete to `org_id = currentOrgId`
- A model without `tenantColumn` runs unscoped queries with no tenant filter injected
- `withoutTenantScope()` disables filtering for the duration of the callback and re-enables it after
- `withoutTenantScope()` re-enables filtering even when the callback throws
- When `TenantContext` has no data (unauthenticated request), no tenant filter is injected
- Tenant filter is always the first `and` condition — never inside an `or` group

### Tenant Routing Tests (`packages/orm/__tests__/tenant-routing.test.ts`)

- `TenantDatabaseResolver.resolve('acme')` returns binding for `DB_TENANT_ACME`
- `TenantDatabaseResolver.resolve('acme-corp')` normalises to `DB_TENANT_ACME_CORP`
- Custom pattern `TENANT_{SLUG}_DB` is respected when configured
- When per-tenant binding exists, `OrmServiceProvider.boot()` uses it over shared DB
- When per-tenant binding is absent, `OrmServiceProvider.boot()` falls back to shared `DB`
- Strategy `'row'` ignores per-tenant binding entirely even if it exists

### D1 Session Tests (`packages/orm/__tests__/d1-session.test.ts`)

- Before any write, `sessionAwareRaw()` returns the plain DB handle (no `withSession` call)
- After `markWritten()`, `sessionAwareRaw()` calls `db.withSession()`
- After `markWritten(token)` with an explicit token, `sessionAwareRaw()` calls `db.withSession(token)`
- Multiple reads after a write all use the same session token (token is retained)
- Session token does not persist across requests (each request gets a fresh `D1SessionHandle`)
- When `database.useSession: false` (default), `D1SessionHandle` is never instantiated

## Error Handling

| Scenario | Behaviour |
|---|---|
| Org slug resolved but no DB record found | `TenantScopeMiddleware` throws `TenantNotResolvedError` — returns 404 |
| `tenantColumn` set but `TenantContext` empty | No filter injected — request proceeds as unauthenticated (safe: org_id filter absent means no rows returned for non-shared tables if rows always have org_id set) |
| Per-tenant binding missing in `'database'` strategy | Falls back to shared DB — logs a warning via the structured logger |
| `withoutTenantScope` callback throws | Finally block restores bypass flag — context is not left in a bypassed state |
| `withSession()` not available on D1 binding | `D1SessionHandle.sessionAwareRaw()` catches the missing method and falls back to plain handle — logs warning |

## Failure Modes

**Row leak (highest risk)**: If `TenantScopeMiddleware` is not registered or runs after route handlers, `TenantContext` is empty and no filter is injected. Rows from all tenants are visible. **Mitigation**: The middleware should be the first thing registered in the application middleware stack. Add an integration test that asserts a request without a resolved org to a tenant-scoped route returns empty results, not rows from other tenants.

**Cross-tenant write via `create()`**: If `tenantColumn` is set but the caller explicitly passes a different `org_id` in attrs, the explicit value wins. **Mitigation**: `create()` should enforce the context value by overwriting any caller-supplied `tenantColumn` value when context is active. This is enforced in the implementation.

**Escape hatch misuse**: `withoutTenantScope()` in a route handler bypasses all tenant filtering. **Mitigation**: Lint rule (documented convention, not enforced in code) — `withoutTenantScope` is restricted to admin-namespaced routes and service layer functions, never in user-facing route handlers.

**Database-per-tenant fallback silent failure**: A misconfigured binding name falls back to shared DB silently. This means tenant A could read tenant B's data if the per-tenant DB was expected to be isolated. **Mitigation**: In `'database'` strategy, if the binding is missing _and_ the org is known to have a dedicated DB, throw `TenantBindingNotFoundError` instead of falling back. This requires storing a `hasDedicatedDb` flag on the org record, which is out of scope for Phase 6 — the fallback behaviour is acceptable for the tiered model (some tenants share, some have dedicated DBs).

**Session token cross-contamination**: If `D1SessionHandle` were a module singleton, session tokens from one request would bleed into another. The handle must be instantiated per-request inside `OrmServiceProvider.boot()`. Tests should assert the handle is not shared across simulated concurrent requests.

**`withSession()` not available in local dev**: Miniflare / `wrangler dev` may not support `withSession()`. `D1SessionHandle` wraps the call in a try/catch and falls back to the plain handle with a warning log. This means sessions are best-effort in development.

## Validation Commands

```bash
bun test --filter orm
bun test --filter auth
bun run typecheck
```
