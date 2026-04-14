# Phase 1: Production Foundations — Implementation Spec

**Phase**: 1 of 8
**Status**: Ready for execution
**Blocks**: All other phases (ExecutionContext threading and Logger are consumed by phases 2–8)

---

## Technical Approach

Five self-contained changes, none of which depend on each other, but all of which must land before any Phase 2+ work begins:

1. **ExecutionContext threading** — `Application` gains a `ctx` property and a `defer(promise)` helper. `handle()` accepts an optional second argument so the Worker entry point can pass `ctx`. The scoped container gets a `'ctx'` binding per request so middleware can call `waitUntil()` without importing `Application`.
2. **Structured Logger + RequestIdMiddleware** — A `Logger` class lives in `packages/core/src/logger.ts`. `RequestIdMiddleware` registers a scoped `Logger` per request and injects `X-Request-Id` into the response. Both are exported from `@roostjs/core`.
3. **CPU limits in wrangler.jsonc** — One object key added to the scaffolded config in `new.ts`.
4. **Smart Placement in wrangler.jsonc** — One object key added to the scaffolded config in `new.ts`.
5. **Gradual rollout hint in wrangler.jsonc** — A comment-carrying string constant placed in the generated `wrangler.jsonc` that documents `wrangler deployments list` and `wrangler rollback`. Because `JSON.stringify` strips comments, the file is built with a manual string template rather than a plain object for the comment lines.

The three wrangler changes (3, 4, 5) are a single edit to one function. Items 1 and 2 are independent and can be implemented in parallel.

---

## Feedback Strategy

**Inner loop**: `bun test --filter core` — covers items 1 and 2 entirely.

**Wrangler changes** (items 3–5): no automated test needed; the generated output is deterministic and visually verifiable. A snapshot test in `packages/cli/__tests__/new.test.ts` is the right place if one exists; if not, a quick `diff` of the generated file against expected output suffices.

**Type loop**: `bun run typecheck` after every file change.

---

## File Changes

### New Files

| File | Package | Purpose |
|---|---|---|
| `packages/core/src/logger.ts` | `@roostjs/core` | `Logger` class with structured JSON output and trace ID |
| `packages/core/src/middleware/request-id.ts` | `@roostjs/core` | `RequestIdMiddleware` — scopes Logger, writes `X-Request-Id` |
| `packages/core/__tests__/logger.test.ts` | `@roostjs/core` | Unit tests for `Logger` |
| `packages/core/__tests__/request-id-middleware.test.ts` | `@roostjs/core` | Unit tests for `RequestIdMiddleware` |

### Modified Files

| File | Package | Change |
|---|---|---|
| `packages/core/src/application.ts` | `@roostjs/core` | Add `ctx` property, `defer()` method, accept `ctx` in `handle()`, bind `'ctx'` in scoped container |
| `packages/core/src/types.ts` | `@roostjs/core` | Export `LogContext`, `LogLevel`, `LogEntry` types |
| `packages/core/src/index.ts` | `@roostjs/core` | Export `Logger`, `RequestIdMiddleware` |
| `packages/core/__tests__/application.test.ts` | `@roostjs/core` | Add tests for `defer()` and ctx threading |
| `packages/cli/src/commands/new.ts` | `@roostjs/cli` | Add `limits`, `placement`, and gradual rollout comment to generated `wrangler.jsonc` |

---

## Implementation Details

---

### Item 1: Thread ExecutionContext through Application

**Pattern to follow**: `this.env` in `Application` constructor — same shape, same assignment.

**Overview**

The Workers runtime passes `ExecutionContext` (`ctx`) as the third argument to `fetch(request, env, ctx)`. Right now `Application` discards it. Any middleware or handler that needs to call `ctx.waitUntil()` for fire-and-forget work (logging flushes, background analytics, cache warming) must reach outside Roost. `defer()` is a thin ergonomic wrapper that:

- stores `ctx` on the `Application` instance when `handle()` is called
- exposes `app.defer(promise)` as the single canonical way to schedule background work
- binds `'ctx'` in the per-request scoped container so middleware written without an `app` reference can still access it

**Key decisions**

- `ctx` is optional everywhere (`ExecutionContext | undefined`). This preserves backward compatibility: existing tests that call `app.handle(request)` with no context continue to work. `defer()` no-ops when `ctx` is absent rather than throwing — the framework degrades gracefully in unit tests and environments without a real runtime context.
- `ctx` is stored on the instance (not a closure) to keep the constructor signature additive. The alternative — passing `ctx` through every internal call — would require touching `Pipeline`, `boot()`, and providers unnecessarily.
- The `'ctx'` string token in the scoped container follows the same pattern as `'test-value'` used in existing tests. A string token avoids importing a CF type into every middleware file.
- `handle()` accepts `ctx` as a second, optional parameter: `handle(request: Request, ctx?: ExecutionContext): Promise<Response>`. This mirrors the CF Workers `fetch` signature directly.

**Implementation steps**

1. Add `import type { ExecutionContext } from '@cloudflare/workers-types'` to `application.ts` — or use the local definition `interface ExecutionContext { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void; }` if the workers-types package is not already a dependency of `@roostjs/core`. Check `packages/core/package.json` first.
2. Add `private _ctx: ExecutionContext | undefined` as a private property.
3. Add `defer(promise: Promise<unknown>): void` method that calls `this._ctx?.waitUntil(promise)`.
4. Update `handle(request: Request, ctx?: ExecutionContext)` to assign `this._ctx = ctx` before calling `boot()`.
5. After creating the scoped container inside `handle()`, bind `'ctx'` to a transient that returns `this._ctx`:
   ```ts
   scoped.bind('ctx', () => this._ctx);
   ```
6. Update `packages/core/__tests__/application.test.ts` with two new tests:
   - `defer() calls waitUntil on the ExecutionContext`
   - `ctx is resolvable from the scoped container inside middleware`

**Feedback loop**

```bash
bun test --filter core
```

---

### Item 2: Structured Logger + RequestIdMiddleware

**Pattern to follow**: `AuthMiddleware` in `packages/auth/src/middleware/auth.ts` — resolves a dependency from `request.__roostContainer`, does work, calls `next(request)`.

**Overview**

Every log line emitted from a Roost application should carry:
- `requestId`: the CF Ray ID or a generated UUID
- `method` and `path`: from the incoming `Request`
- `level`: `"debug" | "info" | "warn" | "error"`
- `message`: the log message
- `timestamp`: ISO 8601
- `userId` (optional): populated if available from the auth context

The output is a single JSON object per line (JSON Lines), which is what CF Logpush and Workers Logs ingest natively. No log aggregation library is needed — `console.log(JSON.stringify(entry))` is the full implementation. The point is the structured shape, not the transport.

`RequestIdMiddleware` is the entry point that:
1. Derives a `requestId` from `request.headers.get('cf-ray') ?? crypto.randomUUID()`
2. Creates a `Logger` instance with that `requestId` plus method/path pre-bound
3. Registers the `Logger` in the scoped container under the `Logger` class token
4. Calls `next(request)` and awaits the response
5. Injects `X-Request-Id: <requestId>` into the response headers before returning

**Key decisions**

- `Logger` is a class (not a factory function) so it can be used as its own container token — `scoped.singleton(Logger, () => new Logger(...))` — matching how `SessionManager` is used in auth.
- `Logger` takes `LogContext` (requestId, method, path, userId?) in its constructor and exposes `info()`, `warn()`, `error()`, `debug()` methods. No log levels are filtered by default — Workers Logs handles that at ingestion.
- `userId` enrichment is best-effort: `RequestIdMiddleware` calls `request.__roostContainer?.resolve(SessionManager)` and reads `.userId` if available. If auth hasn't run or auth isn't installed, `userId` is omitted. This avoids a hard dependency on `@roostjs/auth` from `@roostjs/core`.
- The `Logger` class has `fake()` and `restore()` static methods for tests. `Logger.fake()` returns a `FakeLogger` that collects entries in memory. `FakeLogger` exposes `assertLogged(level, partialMessage)` and `assertNotLogged(level)`.
- Response headers are immutable in CF Workers once sent; `new Response(response.body, response)` is the correct clone pattern to add headers (as seen in `middleware.test.ts`).

**`Logger` API surface**

```ts
// packages/core/src/logger.ts

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId: string;
  method: string;
  path: string;
  userId?: string;
}

export interface LogEntry extends LogContext {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export class Logger {
  constructor(private context: LogContext) {}

  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
  debug(message: string, data?: Record<string, unknown>): void

  static fake(): FakeLogger
}

export class FakeLogger extends Logger {
  readonly entries: LogEntry[]
  assertLogged(level: LogLevel, message: string): void   // throws if not found
  assertNotLogged(level: LogLevel): void                 // throws if any entry at level
  restore(): void                                        // clears entries
}
```

**`RequestIdMiddleware` shape**

```ts
// packages/core/src/middleware/request-id.ts
import type { Middleware } from '../types.js';
import { Logger } from '../logger.js';

export class RequestIdMiddleware implements Middleware {
  async handle(request: Request, next: (request: Request) => Promise<Response>): Promise<Response> {
    const requestId = request.headers.get('cf-ray') ?? crypto.randomUUID();
    const url = new URL(request.url);
    const logger = new Logger({ requestId, method: request.method, path: url.pathname });

    (request as any).__roostContainer?.bind(Logger, () => logger);

    const response = await next(request);
    const modified = new Response(response.body, response);
    modified.headers.set('X-Request-Id', requestId);
    return modified;
  }
}
```

**Implementation steps**

1. Create `packages/core/src/logger.ts` with `Logger`, `FakeLogger`, `LogLevel`, `LogContext`, `LogEntry`.
2. Create `packages/core/src/middleware/request-id.ts` with `RequestIdMiddleware`.
3. Export both from `packages/core/src/index.ts`.
4. Create `packages/core/__tests__/logger.test.ts`.
5. Create `packages/core/__tests__/request-id-middleware.test.ts`.

**Test cases — logger.test.ts**

- `logs a JSON line with requestId, method, path, level, message, timestamp`
- `each log level emits the correct level field`
- `data is included when provided`
- `FakeLogger.fake() collects log entries`
- `FakeLogger.assertLogged() passes when entry exists`
- `FakeLogger.assertLogged() throws when entry does not exist`
- `FakeLogger.assertNotLogged() passes when level has no entries`
- `FakeLogger.assertNotLogged() throws when level has entries`
- `FakeLogger.restore() clears collected entries`

**Test cases — request-id-middleware.test.ts**

- `adds X-Request-Id header to response`
- `uses cf-ray header as request ID when present`
- `generates a UUID when cf-ray is absent`
- `registers Logger in the scoped container`
- `calls next and returns its response`

**Feedback loop**

```bash
bun test --filter core
```

---

### Items 3–5: wrangler.jsonc scaffolding changes

**Pattern to follow**: The existing `writeFile(join(dir, 'wrangler.jsonc'), ...)` call in `new.ts` lines 106–113.

**Overview**

Three additions to the generated `wrangler.jsonc`:

- `limits: { cpu_ms: 50 }` — The CF architecture guide recommends this as a defensive cap. 50ms is the Workers free tier maximum and a safe default for any new project; the developer can raise it in `wrangler.jsonc` when they know their workload.
- `placement: { mode: "smart" }` — Smart Placement analyzes traffic and co-locates the Worker near its data sources (D1, Durable Objects). Zero cost to enable; significant latency improvement for database-heavy apps. Roost is explicitly a database-heavy framework.
- Gradual rollout comment — `wrangler.jsonc` is a JSONC file (JSON with Comments). The comment educates developers that `wrangler deploy --x-versions` enables gradual rollout and that `wrangler rollback` undoes a bad deploy. This is not a `version_management` key because Wrangler 4's versions API is activated at deploy time, not in config.

**Key decision: JSONC string template vs JSON.stringify**

`JSON.stringify` produces valid JSON, not JSONC — it cannot emit comments. The current `wrangler.jsonc` write uses `JSON.stringify`, which works fine for the existing keys since none require comments. For item 5, the cleanest approach is to keep `JSON.stringify` for the non-comment fields and append a comment block at the end, or switch the entire `wrangler.jsonc` write to a template literal. A template literal is more maintainable since the schema URL, name interpolation, and all keys are visible in one place.

Switch the `wrangler.jsonc` write to a template literal string. Use `JSON.stringify` only for sub-values if needed (e.g., `compatibility_date`).

**Implementation steps**

1. Replace the `JSON.stringify({...})` call for `wrangler.jsonc` with a template literal that includes all current fields plus `limits`, `placement`, and a comment block.
2. The comment block should appear after the last real key, before the closing `}`:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "my-app",
  "compatibility_date": "2026-04-14",
  "compatibility_flags": ["nodejs_compat"],
  "main": "@tanstack/react-start/server-entry",
  "observability": { "enabled": true },
  "limits": { "cpu_ms": 50 },
  "placement": { "mode": "smart" },

  // Gradual rollout: deploy with `wrangler deploy --x-versions` to enable version management.
  // Use `wrangler deployments list` to see active versions and traffic splits.
  // Use `wrangler rollback` to instantly revert a bad deploy.
}
```

3. No test change required — the CLI command output is a file write; snapshot tests are optional.

**Feedback loop**

Manual: run `node -e "require('./packages/cli/src/commands/new.js').newProject('test-app')"` and inspect `test-app/wrangler.jsonc`, then `rm -rf test-app`. Or add a snapshot test to `packages/cli/__tests__/new.test.ts` if it exists.

---

## Testing Requirements

All tests use `bun test`. Test files live in `packages/core/__tests__/`.

| Test file | What it covers |
|---|---|
| `__tests__/application.test.ts` (modified) | `defer()` no-ops without ctx; `defer()` calls `waitUntil`; `'ctx'` is resolvable from scoped container in middleware |
| `__tests__/logger.test.ts` (new) | All `Logger` methods emit correct JSON shape; `FakeLogger` assertion helpers |
| `__tests__/request-id-middleware.test.ts` (new) | Header injection, cf-ray passthrough, UUID fallback, container registration |

**Fake pattern requirements**

`FakeLogger` must implement the full `Logger` interface so it can replace `Logger` in any test that uses `RequestIdMiddleware`. Tests that assert on log output construct a `FakeLogger` directly rather than spying on `console.log`.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `app.defer(promise)` called with no `ExecutionContext` | Silent no-op. The promise is not scheduled. No error thrown. |
| `'ctx'` resolved from scoped container when `ctx` is undefined | Returns `undefined`. Callers must guard: `const ctx = container.resolve('ctx') as ExecutionContext \| undefined`. |
| `Logger` constructed with partial context (no userId) | `userId` field omitted from JSON output. No error. |
| `new URL(request.url)` throws (malformed URL in test) | Constructor is called with a valid CF Request, so this only occurs in poorly-constructed unit tests. No special handling needed in production. |
| `FakeLogger.assertLogged` called on empty entries | Throws with a clear message: `Expected a "${level}" log containing "${message}" but found none.` |

---

## Failure Modes

| Failure | Impact | Detection |
|---|---|---|
| `ExecutionContext` not passed to `handle()` | `defer()` silently drops promises | Unit test: assert `waitUntil` is not called |
| `RequestIdMiddleware` not registered in global middleware | No `X-Request-Id` header; no Logger in container | Integration: check response headers |
| `cf-ray` header absent in local dev | UUID generated per request instead of stable Ray ID | Expected; non-issue in production |
| Worker exceeds `cpu_ms: 50` limit | CF terminates the invocation with a 503 | Expected for pathological workloads; developer adjusts the limit |
| `placement: smart` causes unexpected region for latency-sensitive tests | Tests that depend on low-latency local execution behave differently in production | Not a code failure; document in Phase 1 notes |

---

## Validation Commands

```bash
# Run core tests (covers items 1 and 2)
bun test --filter core

# Type check all packages
bun run typecheck

# Smoke test scaffolded wrangler.jsonc (items 3–5)
# Run from repo root; delete test-app after inspection
node -e "
  import('./packages/cli/src/commands/new.js').then(m =>
    m.newProject('test-app').then(() => {
      const fs = require('fs');
      console.log(fs.readFileSync('test-app/wrangler.jsonc', 'utf8'));
    })
  );
" && rm -rf test-app
```

---

## Rollout Considerations

**Backward compatibility**

- `handle(request: Request, ctx?: ExecutionContext)` — the `ctx` parameter is optional. All existing call sites that pass only `request` continue to work without modification.
- `Application` constructor signature is unchanged.
- `Logger` and `RequestIdMiddleware` are new exports; no existing code is modified.
- `wrangler.jsonc` changes are additive. The `limits` and `placement` keys are safe defaults; any existing project that was generated before this change is unaffected.

**Upgrade path for existing projects**

Developers with existing Roost projects can adopt these changes manually:
1. Add `"limits": { "cpu_ms": 50 }` and `"placement": { "mode": "smart" }` to their `wrangler.jsonc`.
2. Register `RequestIdMiddleware` in their app bootstrap: `app.useMiddleware(RequestIdMiddleware)`.
3. Pass `ctx` from their Worker entry point: `app.handle(request, ctx)`.

A future `roost upgrade` command (Phase 2+) can automate this.

**CPU limit tuning**

`cpu_ms: 50` is the Workers free-tier default and a safe starting value. Apps doing heavy computation (PDF parsing, image manipulation, Workflow steps) will need to raise this. The scaffolded comment documents how to do so. The limit is per-invocation, not per-deploy, so it can be changed without redeployment.
