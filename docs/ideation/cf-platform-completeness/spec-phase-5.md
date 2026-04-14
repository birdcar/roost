# Implementation Spec: CF Platform Completeness - Phase 5

**Contract**: ./contract.md
**Estimated Effort**: M

## Technical Approach

Phase 5 delivers two orthogonal features — feature flags and rate limiting — both built on Roost's existing KV and DO wrappers. They share no code, but they do share a philosophy: fake-friendly static APIs, per-request in-memory caching to avoid redundant reads, and the same `Middleware` interface everything else in Roost uses.

**Feature Flags** live in a new `@roostjs/feature-flags` package. The central API is a static `FeatureFlag` class that reads from a `KVStore` registered under the `FLAGS_KV` binding by default. The binding name is configurable. Flags are stored as JSON-serialized values, so a boolean flag is `"true"` / `"false"`, a percentage rollout flag is a number, and a complex config flag is an object. `FeatureFlagMiddleware` batch-reads a declared set of flags at request start and populates a per-request cache, so every subsequent `FeatureFlag.isEnabled()` call within that request is a cache hit with zero additional KV reads. The `FeatureFlagServiceProvider` registers the KV binding and wires the static class to the request-scoped container.

**Rate Limiting** stays in `packages/cloudflare` alongside the KV and DO wrappers it depends on, since it is a direct composition of those two primitives. Two concrete classes implement the `Middleware` interface:

- `KVRateLimiter` — sliding window using KV. Approximate (5–10% over-limit tolerance) due to KV's eventual consistency. Cheap: 1 KV read per request, 1 KV write only when the window needs to be updated.
- `DORateLimiter` — exact counting using a Durable Object. The DO runs an atomic counter; every request goes through a DO `fetch()`. Consistent but carries per-request DO lookup cost.

Both return `429 Too Many Requests` with a `Retry-After` header when the limit is exceeded. Both accept a key extractor function so callers can rate-limit by IP, user ID, org ID, or any arbitrary request property.

The fake infrastructure mirrors the `Job.fake()` pattern from `@roostjs/queue`: module-level `WeakMap` keyed on the class, `static fake()` installs the fake, `static restore()` removes it, and `static assert*()` methods throw on unmet expectations.

## Feedback Strategy

**Inner-loop commands**:
```bash
bun test --filter feature-flags
bun test --filter cloudflare
bun run typecheck
```

**Fakes as the test surface**: Rate limiters and feature flag reads are tested entirely through their fakes. No real KV namespace or DO is needed in the test suite. The fake intercepts at the static class level — no network calls, no Workers runtime dependency.

**Why this approach**: KV and DO are not available in `bun:test` without Miniflare. Isolating the business logic (flag evaluation, window arithmetic) from the CF runtime calls means the full suite runs in < 2 seconds. Correctness of the KV/DO interaction is verified by reading the CF docs, not by running against a real namespace.

## File Changes

### New Files

| File Path | Purpose |
|---|---|
| `packages/feature-flags/package.json` | @roostjs/feature-flags package manifest |
| `packages/feature-flags/tsconfig.json` | Extends root tsconfig, NodeNext modules |
| `packages/feature-flags/src/index.ts` | Public API exports |
| `packages/feature-flags/src/feature-flag.ts` | FeatureFlag static class with get/set/isEnabled/getValue |
| `packages/feature-flags/src/middleware.ts` | FeatureFlagMiddleware — batch read declared flags into request cache |
| `packages/feature-flags/src/provider.ts` | FeatureFlagServiceProvider — registers FLAGS_KV binding |
| `packages/feature-flags/src/cache.ts` | Per-request flag cache (Map-based, Symbol key) |
| `packages/feature-flags/src/fake.ts` | FeatureFlagFake — in-memory flag store for tests |
| `packages/feature-flags/src/errors.ts` | FlagNotFoundError, FlagStoreNotConfiguredError |
| `packages/feature-flags/src/types.ts` | FlagValue, FlagStore interface, FlagCacheKey |
| `packages/feature-flags/__tests__/feature-flag.test.ts` | isEnabled, getValue, set via fake |
| `packages/feature-flags/__tests__/middleware.test.ts` | Batch read, cache population, passthrough |
| `packages/feature-flags/__tests__/provider.test.ts` | ServiceProvider registration |
| `packages/feature-flags/__tests__/fake.test.ts` | fake(), restore(), assertChecked() |
| `packages/cloudflare/src/rate-limiting/kv-rate-limiter.ts` | KV sliding window middleware |
| `packages/cloudflare/src/rate-limiting/do-rate-limiter.ts` | DO exact counting middleware |
| `packages/cloudflare/src/rate-limiting/types.ts` | RateLimiterConfig, KeyExtractor, RateLimitResult |
| `packages/cloudflare/src/rate-limiting/fake.ts` | RateLimiterFake — per-key allow/limit control |
| `packages/cloudflare/src/rate-limiting/durable-object.ts` | RateLimiterDO class (Durable Object implementation) |
| `packages/cloudflare/__tests__/kv-rate-limiter.test.ts` | KV limiter window logic, 429 response, Retry-After |
| `packages/cloudflare/__tests__/do-rate-limiter.test.ts` | DO limiter delegation, 429 response, Retry-After |
| `packages/cloudflare/__tests__/rate-limiter-fake.test.ts` | fake(), assertLimited(), assertAllowed() |

### Modified Files

| File Path | Change |
|---|---|
| `packages/cloudflare/src/index.ts` | Export KVRateLimiter, DORateLimiter, RateLimiterFake, rate-limiting types |
| `packages/cli/src/commands/make.ts` | Add makeRateLimiter(name, variant) for KV and DO scaffolds |
| `packages/cli/src/index.ts` | Wire make:rate-limiter command, update printHelp() |

## Implementation Details

---

### 1. @roostjs/feature-flags — FeatureFlag

**Overview**: Static class that reads from a `KVStore` instance. The store is injected via `FeatureFlag.configure(store)` which `FeatureFlagServiceProvider` calls during `register()`. After that, all static methods work without passing a store reference. Tests call `FeatureFlag.fake({ 'my-flag': true })` instead of configuring a real store.

**`src/types.ts`**:
```ts
export type FlagValue = boolean | number | string | Record<string, unknown>;

export interface FlagStore {
  get<T = FlagValue>(flag: string): Promise<T | null>;
  set<T = FlagValue>(flag: string, value: T): Promise<void>;
}

export const FLAG_CACHE_KEY: unique symbol = Symbol('roost.flagCache');
```

**`src/feature-flag.ts`**:

`FeatureFlag` holds a module-level `store: FlagStore | null` and a module-level `fake: FeatureFlagFake | null`. Static methods check the fake first, then fall through to the real store. Cache reads happen via `getRequestCache(request)` — a helper that reads `(request as any)[FLAG_CACHE_KEY]` and returns the `Map<string, FlagValue>` attached by `FeatureFlagMiddleware`.

```ts
export class FeatureFlag {
  static configure(store: FlagStore): void
  static async isEnabled(flag: string, request?: Request): Promise<boolean>
  static async getValue<T extends FlagValue>(flag: string, request?: Request): Promise<T | null>
  static async set<T extends FlagValue>(flag: string, value: T): Promise<void>
  static fake(flags: Record<string, FlagValue>): void
  static restore(): void
  static assertChecked(flag: string): void
}
```

`isEnabled()` returns `true` if the stored value is the boolean `true`, the string `"true"`, or a number > 0. All other values (including `null` / missing) return `false`. This mirrors the Laravel convention of truthy flag values.

Per-request cache check order:
1. If `request` is provided and has an attached cache map, return from map.
2. If fake is active, return from fake's in-memory map.
3. Read from the configured `FlagStore` (real KV).

**`src/cache.ts`**:

```ts
export function getRequestCache(request: Request): Map<string, FlagValue> | null
export function setRequestCache(request: Request, cache: Map<string, FlagValue>): void
```

Uses `(request as any)[FLAG_CACHE_KEY]`. `FeatureFlagMiddleware` calls `setRequestCache` before calling `next`. Downstream `FeatureFlag.isEnabled()` calls receive the request and call `getRequestCache`.

**`src/middleware.ts`**:

`FeatureFlagMiddleware` takes a list of flag names at construction time. In `handle()`, it:
1. Calls `KVStore.get(flag, 'json')` for each flag (parallel `Promise.all`).
2. Builds a `Map<string, FlagValue>`.
3. Calls `setRequestCache(request, map)`.
4. Calls `next(request)`.

The flag list is declared at app startup — this is the batch read that amortizes KV cost. Flags not in the list are fetched lazily (single KV read) on the first `FeatureFlag.isEnabled()` call within the request and added to the cache.

```ts
export class FeatureFlagMiddleware implements Middleware {
  constructor(private flags: string[]) {}
  async handle(request: Request, next: (r: Request) => Promise<Response>): Promise<Response>
}
```

**`src/provider.ts`**:

`FeatureFlagServiceProvider` reads the binding name from `app.config.get('flags.kv', 'FLAGS_KV')` and looks it up in `app.env`. If the binding exists, it wraps it in a `KVStore` and calls `FeatureFlag.configure(store)`. If the binding is missing, it logs a warning and skips — feature flags degrade gracefully (all `isEnabled()` calls return `false`).

```ts
export class FeatureFlagServiceProvider extends ServiceProvider {
  register(): void
}
```

**`src/fake.ts`**:

```ts
class FeatureFlagFake {
  private flags: Map<string, FlagValue>
  private checked: Set<string>

  constructor(flags: Record<string, FlagValue>)
  get<T extends FlagValue>(flag: string): Promise<T | null>
  set<T extends FlagValue>(flag: string, value: T): Promise<void>
  recordCheck(flag: string): void
  wasChecked(flag: string): boolean
}
```

`FeatureFlag.fake()` installs the fake; `assertChecked(flag)` calls `fake.wasChecked(flag)` and throws if false.

---

### 2. @roostjs/cloudflare — KVRateLimiter

**Overview**: Sliding window counter stored in KV. Each window is a JSON object `{ count: number, windowStart: number }` keyed by `rate-limit:{key}:{windowIndex}`. The window index is `Math.floor(Date.now() / (window * 1000))`. On each request:
1. Compute `windowKey`.
2. KV `get(windowKey, 'json')` — if null, treat as `{ count: 0, windowStart: now }`.
3. If `count >= limit`, return 429 with `Retry-After: secondsUntilNextWindow`.
4. Increment count and `putJson(windowKey, ..., { expirationTtl: window * 2 })`.

The TTL of `window * 2` ensures old window entries are automatically cleaned up. Writing only happens after the read, and only when the request is allowed — rejected requests do not increment the counter (this prevents a DDoS from inflating counters while adding KV write cost).

```ts
export interface RateLimiterConfig {
  limit: number;
  window: number; // seconds
  keyExtractor?: (request: Request) => string;
}

export class KVRateLimiter implements Middleware {
  constructor(private kv: KVStore, private config: RateLimiterConfig) {}
  async handle(request: Request, next: (r: Request) => Promise<Response>): Promise<Response>
}
```

Default `keyExtractor` reads `CF-Connecting-IP` header, falls back to `X-Forwarded-For`, then falls back to `"unknown"`.

**`src/rate-limiting/types.ts`**:

```ts
export type KeyExtractor = (request: Request) => string;

export interface RateLimiterConfig {
  limit: number;
  window: number;
  keyExtractor?: KeyExtractor;
}

export interface WindowState {
  count: number;
  windowStart: number;
}
```

---

### 3. @roostjs/cloudflare — DORateLimiter

**Overview**: Exact counting via a Durable Object. The DO name is derived from the extracted key — `rate-limit:{key}`. Each DO holds a simple in-memory counter per window. The rate limiter sends a `POST /check` request to the DO with the limit and window in the body. The DO responds `{ allowed: boolean, remaining: number, retryAfter?: number }`.

The DO class (`RateLimiterDO`) lives in `packages/cloudflare/src/rate-limiting/durable-object.ts` and must be exported from the package for users to add to their `wrangler.jsonc`. The spec includes the wrangler config snippet in the testing section.

```ts
export class DORateLimiter implements Middleware {
  constructor(
    private doClient: DurableObjectClient,
    private config: RateLimiterConfig
  ) {}
  async handle(request: Request, next: (r: Request) => Promise<Response>): Promise<Response>
}
```

**`src/rate-limiting/durable-object.ts`**:

```ts
export class RateLimiterDO {
  private state: DurableObjectState;
  private windows = new Map<string, WindowState>();

  constructor(state: DurableObjectState) { this.state = state; }

  async fetch(request: Request): Promise<Response>
  // POST /check — body: { key: string, limit: number, window: number }
  // Returns: { allowed: boolean, remaining: number, retryAfter?: number }
}
```

The DO uses `this.state.blockConcurrencyWhile()` on initialization and handles the sliding window atomically. No storage API calls — window state lives in memory and is reset when the DO hibernates. This is acceptable for rate limiting: the worst case on DO restart is one extra request per client getting through.

---

### 4. Rate Limiter Fake

**`src/rate-limiting/fake.ts`**:

Module-level fake state — a single `RateLimiterFake` instance that intercepts both `KVRateLimiter` and `DORateLimiter` via a shared static registry. Unlike `Job.fake()` which uses a `WeakMap` keyed on the class, the rate limiter fake uses a module-level singleton since rate limiters are not class-hierarchy-based.

```ts
export class RateLimiterFake {
  private limitedKeys = new Set<string>();
  private checkedKeys = new Set<string>();

  // Declare that requests from key should be blocked
  limitKey(key: string): void
  allowKey(key: string): void
  recordCheck(key: string): void

  assertLimited(key: string): void
  assertAllowed(key: string): void
  assertChecked(key: string): void

  reset(): void
}

// Static entry points — call these in tests
export function fakeRateLimiter(): RateLimiterFake
export function restoreRateLimiter(): void
```

`KVRateLimiter.handle()` and `DORateLimiter.handle()` both check `getActiveRateLimiterFake()` before doing any KV/DO work. If a fake is active, they delegate to it.

---

### 5. CLI — make:rate-limiter

**`packages/cli/src/commands/make.ts`** — add `makeRateLimiter(name, variant)`:

```ts
export async function makeRateLimiter(name: string, variant: 'kv' | 'do'): Promise<void>
```

KV scaffold:
```ts
import { KVRateLimiter } from '@roostjs/cloudflare';
import type { KVStore } from '@roostjs/cloudflare';

// Injected via container — bind KVStore instance for your rate limit namespace
export const ${pascal}RateLimiter = (kv: KVStore) =>
  new KVRateLimiter(kv, {
    limit: 100,
    window: 60, // seconds
    keyExtractor: (request) => request.headers.get('CF-Connecting-IP') ?? 'unknown',
  });
```

DO scaffold:
```ts
import { DORateLimiter } from '@roostjs/cloudflare';
import type { DurableObjectClient } from '@roostjs/cloudflare';

// Injected via container — bind DurableObjectClient for your rate limit DO
export const ${pascal}RateLimiter = (doClient: DurableObjectClient) =>
  new DORateLimiter(doClient, {
    limit: 100,
    window: 60, // seconds
    keyExtractor: (request) => request.headers.get('CF-Connecting-IP') ?? 'unknown',
  });
```

Output path: `src/middleware/{kebab}-rate-limiter.ts`.

**`packages/cli/src/index.ts`** — add:
```
case 'make:rate-limiter':
  if (!positional[0]) { console.error('Usage: roost make:rate-limiter <Name> [--do]'); process.exit(1); }
  await makeRateLimiter(positional[0], flags['do'] ? 'do' : 'kv');
  break;
```

Update `printHelp()`:
```
    make:rate-limiter <Name>  Generate a rate limiter middleware (--do for exact DO variant)
```

---

## Testing Requirements

### Feature Flags

**`__tests__/feature-flag.test.ts`**:
- `isEnabled()` returns `true` for boolean `true`, string `"true"`, and positive numbers
- `isEnabled()` returns `false` for `false`, `"false"`, `0`, and `null`
- `getValue<T>()` returns typed value from fake store
- `set()` writes to fake store and subsequent `isEnabled()` reflects the update
- `isEnabled()` with request uses cache when present (no store call)
- `isEnabled()` without request but with configured store calls store

**`__tests__/middleware.test.ts`**:
- Middleware batch-reads declared flags before calling `next`
- Cache is populated; subsequent `isEnabled()` with request does not call the store again
- Flags not in the declared list are fetched lazily on first access
- Middleware calls `next(request)` and returns its response unmodified when no flags are tripped

**`__tests__/fake.test.ts`**:
- `fake({ 'feature-x': true })` installs fake; `isEnabled('feature-x')` returns `true`
- `restore()` removes fake; subsequent calls go to real store
- `assertChecked('feature-x')` throws if flag was never read
- `assertChecked('feature-x')` passes if flag was read at least once

### Rate Limiting

**`__tests__/kv-rate-limiter.test.ts`**:
- Requests under the limit pass through and call `next`
- The (limit+1)th request within the window returns 429
- 429 response includes `Retry-After` header with correct seconds until next window
- Counter resets when the window advances (new `windowKey`)
- Custom `keyExtractor` is called and its return value is used as the key
- Default key extractor uses `CF-Connecting-IP`

**`__tests__/do-rate-limiter.test.ts`**:
- Delegates to DO stub; allowed responses call `next`
- DO stub returning `{ allowed: false, retryAfter: 30 }` produces 429 with `Retry-After: 30`
- Key passed to DO is derived from `keyExtractor`

**`__tests__/rate-limiter-fake.test.ts`**:
- `fakeRateLimiter()` returns a fake; rate limiters use it when active
- `fake.limitKey('1.2.3.4')` causes requests from that IP to get 429
- `fake.assertLimited('1.2.3.4')` passes after a limited request
- `fake.assertAllowed('1.2.3.4')` passes after an allowed request
- `restoreRateLimiter()` removes the fake; real KV/DO path is used

---

## Error Handling

**Feature Flags**:
- `FlagStoreNotConfiguredError` — thrown by `FeatureFlag.isEnabled()` if no store is configured and no fake is active. Message: `"FeatureFlag store is not configured. Did you register FeatureFlagServiceProvider?"`. Allows tests without the provider to fail clearly rather than silently returning `false`.
- `FlagNotFoundError` — thrown by `getValue<T>()` when the flag does not exist in the store and no default is provided. `isEnabled()` never throws for missing flags — it returns `false`.
- Provider silently skips configuration if `FLAGS_KV` binding is absent (logs a warning via the Phase 1 structured logger if available, otherwise `console.warn`).

**Rate Limiting**:
- If `KVRateLimiter`'s KV read fails (network error, quota), the middleware **allows the request through** and logs the error. Rate limiter failures must not take down application traffic.
- If `DORateLimiter`'s DO fetch fails, same policy: fail open, log error. The rationale is that a broken rate limiter is less dangerous than a broken application.
- Malformed window state in KV (value is not a valid `WindowState`) is treated as a fresh window — the corrupted key is overwritten.

---

## Failure Modes

| Failure | KVRateLimiter behavior | DORateLimiter behavior |
|---|---|---|
| KV/DO unreachable | Fail open — allow request | Fail open — allow request |
| KV returns malformed JSON | Reset window, allow request | N/A |
| DO hibernated mid-request | N/A — CF handles transparently | N/A |
| DO cold start latency | N/A | Request is delayed, not failed |
| KV eventual consistency lag | Count may be 5–10% over limit | N/A — DO is strongly consistent |
| Clock skew between Workers | Window boundary off by ≤ 1s | N/A — DO is single-threaded |
| Missing `CF-Connecting-IP` | Falls back to `X-Forwarded-For`, then `"unknown"` | Same |
| `FLAGS_KV` binding absent | Provider skips, all flags return `false` | N/A |
| KV read timeout (flag check) | `isEnabled()` returns `false` (safe default) | N/A |

---

## Validation Commands

```bash
# Run feature-flags tests
bun test --filter feature-flags

# Run cloudflare package tests (includes rate limiter)
bun test --filter cloudflare

# Type-check all packages
bun run typecheck

# Confirm CLI changes compile and help text is correct
cd packages/cli && bun run build && node dist/index.js help
```

Manual validation (requires `wrangler dev`):
- Bind a real KV namespace as `FLAGS_KV`, set `test-flag: true` via Wrangler KV CLI, confirm `FeatureFlag.isEnabled('test-flag')` returns `true` in a running Worker.
- Configure `KVRateLimiter` with `limit: 3, window: 10`, fire 4 requests in quick succession, confirm the 4th returns 429.
