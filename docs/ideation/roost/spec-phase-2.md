# Implementation Spec: Roost Framework - Phase 2

**Contract**: ./contract.md
**PRD**: ./prd-phase-2.md
**Estimated Effort**: L

## Technical Approach

Phase 2 wires the frontend story onto Phase 1's foundation. TanStack Start (via Vinxi/Nitro) handles SSR, file-based routing, and server functions. The Roost Application from Phase 1 runs as a Nitro server middleware, giving every server function and loader access to the service container and Cloudflare bindings.

The critical seam is the **context bridge**: Vinxi/Nitro exposes a per-request `H3Event`, and Roost attaches a scoped container to that event before TanStack Start handles the request. Server functions call `getRoostContext(event)` to resolve any registered service — including raw Cloudflare bindings — without threading the container manually through every call.

TanStack Router's code-generation runs at build time (and file-watch time) to produce a fully typed route tree. No hand-written route manifests. Route params, search params, and loader data types flow automatically into components.

Nitro's Cloudflare Workers preset means the production build is a single Worker script. Wrangler wraps that. Development uses Vinxi's Vite-based dev server with HMR.

## Feedback Strategy

**Inner-loop command**: `bun run dev` (Vinxi dev server with HMR)

**Playground**: A minimal `apps/playground/` app inside the monorepo — a few routes covering the common cases. Type errors from the generated route tree surface instantly in the editor. Functional tests use `bun:test` with a lightweight HTTP test client.

**Why this approach**: SSR and routing are hard to test purely in-memory. The playground app gives a real rendering target during development. Unit tests cover the context bridge and middleware integration, which are pure logic. End-to-end behavior is verified by running the dev server and checking responses.

## File Changes

### New Files

| File Path | Purpose |
|---|---|
| `apps/playground/package.json` | Playground app manifest |
| `apps/playground/app.config.ts` | Vinxi/TanStack Start configuration |
| `apps/playground/wrangler.toml` | Cloudflare Workers deployment config |
| `apps/playground/app/client.tsx` | TanStack Start client entry |
| `apps/playground/app/router.tsx` | Router factory with Roost context integration |
| `apps/playground/app/routes/__root.tsx` | Root layout with HTML shell |
| `apps/playground/app/routes/index.tsx` | Home page route |
| `apps/playground/worker.ts` | Cloudflare Worker entry point |
| `packages/start/package.json` | @roostjs/start package manifest |
| `packages/start/tsconfig.json` | Extends base TS config |
| `packages/start/src/index.ts` | Public API barrel export |
| `packages/start/src/context.ts` | Roost context bridge (attach/retrieve from H3Event) |
| `packages/start/src/middleware.ts` | Nitro server middleware that boots Roost Application |
| `packages/start/src/server-fn.ts` | withRoost() wrapper for createServerFn |
| `packages/start/src/types.ts` | RoostServerContext type and related interfaces |
| `packages/start/src/provider.ts` | StartServiceProvider for @roostjs/core |
| `packages/start/__tests__/context.test.ts` | Context bridge tests |
| `packages/start/__tests__/middleware.test.ts` | Nitro middleware integration tests |
| `packages/start/__tests__/server-fn.test.ts` | Server function wrapper tests |

### Modified Files

| File Path | Change |
|---|---|
| `package.json` | Add `apps/*` to workspaces array |
| `packages/core/src/application.ts` | Add `handleNitro(event)` method for H3Event integration |
| `packages/core/src/index.ts` | Export new types needed by @roostjs/start |

## Implementation Details

### 1. Monorepo: Add Apps Workspace

**Overview**: The monorepo gains an `apps/` directory alongside `packages/`. The playground app is the development harness for Phase 2 features.

```
roost/
├── package.json              # updated: workspaces: ["packages/*", "apps/*"]
├── packages/
│   ├── core/
│   ├── cloudflare/
│   └── start/                # @roostjs/start — new this phase
└── apps/
    └── playground/           # development/integration harness
```

```json
// package.json (root) — updated workspaces
{
  "name": "roost",
  "private": true,
  "workspaces": ["packages/*", "apps/*"]
}
```

**Key decisions**:
- `apps/` co-locates example/playground apps with the packages they depend on. This makes it trivial to test framework changes against a real app in the same `bun install`.
- The playground is not published. It is the integration test surface for Phase 2.

**Implementation steps**:
1. Update root `package.json` workspaces array
2. Create `apps/playground/` with its `package.json` and Vinxi config
3. Verify `bun install` links workspace packages correctly
4. Run `bun run dev` inside `apps/playground/` — expect a running dev server

**Feedback loop**:
- **Check command**: `bun run dev` in `apps/playground/`

---

### 2. TanStack Start Configuration (`app.config.ts`)

**Overview**: The single file that wires Vinxi, Nitro's Cloudflare preset, TanStack Router's file-based routing, and the Roost Nitro middleware together.

```typescript
// apps/playground/app.config.ts
import { defineConfig } from '@tanstack/start/config';
import viteTsConfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Nitro preset for Cloudflare Workers output
  server: {
    preset: 'cloudflare-module',
    // Roost middleware runs before TanStack Start handles the request
    middleware: ['./src/nitro-middleware'],
  },
  routers: {
    ssr: {
      entry: './app/router.tsx',
    },
    client: {
      entry: './app/client.tsx',
    },
  },
  vite: {
    plugins: [viteTsConfigPaths()],
  },
});
```

**Key decisions**:
- `preset: 'cloudflare-module'` — Nitro's first-class Cloudflare Workers output. Produces a Worker-compatible bundle with proper `fetch` export. Use the module worker format (not service worker) for access to `ExecutionContext`.
- The Roost Nitro middleware path is declared here so Nitro inlines it as a virtual server middleware. It runs in the Nitro/H3 layer before SSR kicks in.
- Vinxi handles all asset bundling and HMR. No custom Vite config needed beyond `vite-tsconfig-paths`.

**Implementation steps**:
1. Install `@tanstack/start`, `vinxi`, `vite-tsconfig-paths` in the playground
2. Create `app.config.ts` with the above shape
3. Confirm `bun run dev` produces a Vite dev server on `localhost:3000`
4. Confirm `bun run build` outputs a Nitro `.output/` directory

**Feedback loop**:
- **Playground**: `apps/playground/`
- **Check command**: `bun run build && ls .output/`

---

### 3. Roost Context Bridge (`packages/start/src/context.ts`)

**Overview**: The mechanism that makes the Roost container available inside TanStack Start's server functions and loaders. A scoped container is attached to the Nitro `H3Event` at the start of each request, then retrieved inside server functions.

Pattern to follow: `packages/core/src/container.ts` — the scoped container pattern from Phase 1.

```typescript
// packages/start/src/context.ts

import type { H3Event } from 'h3';
import type { Application } from '@roostjs/core';
import type { Container } from '@roostjs/core';

/** Symbol used to attach the Roost scoped container to an H3Event. */
const ROOST_CONTEXT_KEY = Symbol('roost.context');

/** The shape of what Roost attaches to each request event. */
export interface RoostServerContext {
  /** A request-scoped container. Resolves from the app's singleton container. */
  container: Container;
  /** The booted Application instance. Provides config, env, container. */
  app: Application;
}

/**
 * Attaches a RoostServerContext to an H3Event.
 * Called once per request by the Nitro server middleware.
 *
 * @param event - The current H3Event from Nitro
 * @param context - The RoostServerContext to attach
 */
export function setRoostContext(event: H3Event, context: RoostServerContext): void {
  // H3 provides a typed context bag on each event via event.context
  (event.context as Record<symbol, RoostServerContext>)[ROOST_CONTEXT_KEY] = context;
}

/**
 * Retrieves the RoostServerContext from an H3Event.
 * Throws if the middleware did not run (misconfiguration guard).
 *
 * @param event - The current H3Event from Nitro
 * @returns The RoostServerContext attached by the middleware
 * @throws {Error} If the Roost middleware was not registered before this call
 */
export function getRoostContext(event: H3Event): RoostServerContext {
  const ctx = (event.context as Record<symbol, RoostServerContext | undefined>)[ROOST_CONTEXT_KEY];

  if (ctx === undefined) {
    throw new Error(
      'Roost context not found on event. ' +
      'Ensure the Roost Nitro middleware is registered in app.config.ts server.middleware.'
    );
  }

  return ctx;
}
```

**Key decisions**:
- Symbol key prevents collision with any other framework attaching to `event.context`.
- Fail-fast on missing context: a missing context means the middleware wasn't registered, which is a developer error that should surface loudly, not silently return `undefined`.
- No generic on `RoostServerContext.container` — callers use `container.resolve(ServiceToken)` which is already typed by Phase 1's container.

**Implementation steps**:
1. Define `RoostServerContext` interface
2. Implement `setRoostContext` and `getRoostContext` with the symbol key
3. Write tests: set then get round-trips, missing context throws with helpful message
4. Export from `packages/start/src/index.ts`

**Feedback loop**:
- **Playground**: `packages/start/__tests__/context.test.ts`
- **Experiment**: Create a mock H3Event, call `setRoostContext`, then `getRoostContext` → same object. Call `getRoostContext` on a bare event → throws with the helpful error message.
- **Check command**: `bun test --filter context`

---

### 4. Nitro Server Middleware (`packages/start/src/middleware.ts`)

**Overview**: The Nitro server middleware that boots the Roost Application once per cold start, creates a scoped container per request, and attaches it to the event so all downstream handlers have framework access.

Pattern to follow: Phase 1's `Application.handle()` and `container.scoped()` patterns.

```typescript
// packages/start/src/middleware.ts
import type { H3Event } from 'h3';
import { defineEventHandler } from 'h3';
import { Application } from '@roostjs/core';
import { setRoostContext } from './context.js';

// The Application instance is cached at module scope so providers boot once
// per Worker cold start, not per request. Singletons (DB connections, SDK clients)
// are registered once and reused across requests.
let cachedApp: Application | null = null;

/**
 * Creates the Roost Nitro server middleware.
 * Register this in app.config.ts under server.middleware.
 *
 * The middleware:
 * 1. Boots the Roost Application on first request (cold start only)
 * 2. Creates a request-scoped container clone for isolation
 * 3. Attaches the container to the H3Event via setRoostContext
 *
 * @param createApp - Factory that constructs the Application. Receives the
 *                    Cloudflare env from the Nitro event context.
 */
export function createRoostMiddleware(
  createApp: (env: CloudflareEnv) => Application
): ReturnType<typeof defineEventHandler> {
  return defineEventHandler(async (event: H3Event) => {
    // Nitro exposes Cloudflare bindings at event.context.cloudflare.env
    const cfEnv = event.context.cloudflare?.env as CloudflareEnv;

    if (cachedApp === null) {
      cachedApp = createApp(cfEnv);
      await cachedApp.boot();
    }

    const scopedContainer = cachedApp.container.scoped();

    setRoostContext(event, {
      container: scopedContainer,
      app: cachedApp,
    });

    // Returning undefined (no return) means "continue to next handler"
  });
}

// Cloudflare env type placeholder — apps augment this via their own types.ts
interface CloudflareEnv {
  [key: string]: unknown;
}
```

**Key decisions**:
- `cachedApp` at module scope mirrors how Workers module instances persist across requests. This is the Workers singleton pattern — correct and intentional.
- The middleware returns `undefined` (no response body), which in H3 means "pass to next handler". Returning a `Response` would short-circuit SSR.
- `event.context.cloudflare.env` is where Nitro's Cloudflare preset exposes Wrangler bindings. This is the official Nitro Cloudflare API.
- `createApp` factory pattern: the app project passes its own `Application` subclass and provider registrations. The middleware doesn't dictate what's in the container.

**Implementation steps**:
1. Implement `createRoostMiddleware` with the module-scope cache pattern
2. Add reset path for tests (export a `resetAppCache()` for use in `beforeEach`)
3. Test: first call boots app, second call uses cached app, scoped container is new per call
4. Document the `app.config.ts` registration pattern in a JSDoc example

**Feedback loop**:
- **Playground**: `packages/start/__tests__/middleware.test.ts`
- **Experiment**: Call middleware twice with mocked event — app boot runs once, `setRoostContext` called twice with different container instances.
- **Check command**: `bun test --filter packages/start`

---

### 5. Server Function Wrapper (`packages/start/src/server-fn.ts`)

**Overview**: A wrapper for TanStack Start's `createServerFn` that automatically extracts the Roost context from the request event and makes the container available to the function body.

```typescript
// packages/start/src/server-fn.ts
import { createServerFn } from '@tanstack/start';
import type { H3Event } from 'h3';
import { getRoostContext } from './context.js';
import type { RoostServerContext } from './context.js';

type ServerFnWithContext<TInput, TOutput> = (
  context: RoostServerContext,
  input: TInput
) => Promise<TOutput>;

/**
 * Wraps createServerFn with automatic Roost context injection.
 * The wrapped function receives the RoostServerContext as its first argument,
 * giving it access to the service container and Application.
 *
 * @example
 * ```typescript
 * const getUser = withRoost(async ({ container }, { userId }: { userId: string }) => {
 *   const db = container.resolve(Database);
 *   return db.users.findById(userId);
 * });
 * ```
 *
 * @param fn - The server function body, receiving Roost context and caller input
 * @returns A TanStack Start server function with Roost context pre-injected
 */
export function withRoost<TInput, TOutput>(
  fn: ServerFnWithContext<TInput, TOutput>
) {
  return createServerFn().handler(async ({ data }: { data: TInput }) => {
    // TanStack Start provides the H3Event via getRequestEvent() during SSR
    const { getRequestEvent } = await import('@tanstack/start/server');
    const event = getRequestEvent()?.nativeEvent as H3Event | undefined;

    if (event === undefined) {
      throw new Error(
        'withRoost: could not retrieve H3Event from request context. ' +
        'Ensure this function is called during SSR, not on the client.'
      );
    }

    const context = getRoostContext(event);
    return fn(context, data);
  });
}
```

**Key decisions**:
- `withRoost` is a decorator-style wrapper, not a hook. It composes with `createServerFn` rather than replacing it. This means all of TanStack Start's server function features (validation, method specification) are still available via chaining.
- Dynamic import of `@tanstack/start/server` avoids importing server-only code into client bundles. Vinxi tree-shakes server function bodies anyway, but the dynamic import makes the intent explicit.
- The `getRequestEvent()` pattern is TanStack Start's official way to access the underlying H3Event from within a server function.

**Implementation steps**:
1. Implement `withRoost` wrapper
2. Test with a mocked server function context
3. Document the pattern with a JSDoc example showing KV access
4. Export from `packages/start/src/index.ts`

**Feedback loop**:
- **Playground**: `packages/start/__tests__/server-fn.test.ts`
- **Check command**: `bun test --filter server-fn`

---

### 6. Root Layout (`app/routes/__root.tsx`)

**Overview**: The root layout provides the HTML shell, document `<head>`, and the `<Outlet />` where all child routes render. This is TanStack Router's required root route file.

```typescript
// apps/playground/app/routes/__root.tsx
import { createRootRoute, Outlet, ScrollRestoration } from '@tanstack/react-router';
import { Meta, Scripts } from '@tanstack/start';
import type { ReactNode } from 'react';

export const Route = createRootRoute({
  // Head meta — framework apps override this per-route via TanStack Router's
  // meta() option on individual routes
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    ],
    links: [
      { rel: 'stylesheet', href: '/app.css' },
    ],
  }),
  component: RootDocument,
  // Route-level error boundary — catches unhandled errors in any child route
  errorComponent: RootError,
});

function RootDocument({ children }: { children?: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Meta />
      </head>
      <body>
        {children ?? <Outlet />}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function RootError({ error }: { error: unknown }) {
  return (
    <html lang="en">
      <head><title>Error</title></head>
      <body>
        <h1>Something went wrong</h1>
        <pre>{error instanceof Error ? error.message : String(error)}</pre>
      </body>
    </html>
  );
}
```

**Key decisions**:
- `createRootRoute` is TanStack Router's API for the root route — not `createRoute`. This distinction is required for the HTML shell to work correctly with SSR hydration.
- `<Meta />` and `<Scripts />` are TanStack Start injectors that place the generated script tags and meta tags into the document. Do not omit `<Scripts />` — it injects the client-side hydration bundle.
- `errorComponent` at the root level catches errors that bubble up from any child route. Each child route can also define its own `errorComponent` for scoped error handling.

**Implementation steps**:
1. Create `app/routes/__root.tsx` with the HTML shell pattern
2. Verify dev server renders the root document
3. Add a trivial child route and confirm it renders inside `<Outlet />`

---

### 7. Route Files and Type-Safe Routing

**Overview**: TanStack Router discovers route files from `app/routes/` and generates a fully typed route tree. This section documents the conventions so a junior developer can add routes correctly.

**Route file naming conventions**:

| File | URL | Description |
|---|---|---|
| `routes/index.tsx` | `/` | Index route |
| `routes/users.tsx` | `/users` | Static segment |
| `routes/users/$userId.tsx` | `/users/:userId` | Dynamic segment — `$` prefix |
| `routes/users/$userId/edit.tsx` | `/users/:userId/edit` | Nested dynamic |
| `routes/_layout.tsx` | (no URL) | Pathless layout route — groups routes under shared layout without adding URL segment |
| `routes/_layout/dashboard.tsx` | `/dashboard` | Route under pathless layout |

```typescript
// apps/playground/app/routes/users/$userId.tsx
import { createFileRoute } from '@tanstack/react-router';
import { withRoost } from '@roostjs/start';
import { UserService } from '../../services/user-service.js';

// Server function that loads the user — runs on the Worker, not the client
const loadUser = withRoost(
  async ({ container }, { userId }: { userId: string }) => {
    const userService = container.resolve(UserService);
    return userService.findById(userId);
  }
);

export const Route = createFileRoute('/users/$userId')({
  // loader runs server-side before the component renders
  // params is fully typed: { userId: string }
  loader: async ({ params }) => loadUser({ data: { userId: params.userId } }),

  component: UserPage,
});

function UserPage() {
  // loaderData type is inferred from loader's return type — no manual annotation
  const user = Route.useLoaderData();

  return <div>{user.name}</div>;
}
```

**Key decisions**:
- `createFileRoute` takes the route path as a string literal. This is required for TanStack Router's type generation — the string must match the file path exactly.
- `Route.useLoaderData()` is typed from the loader return — the component never needs to manually type `loaderData`.
- The `$` prefix in file names maps to `:param` URL segments. This is TanStack Router's file convention, not Roost's.

**Implementation steps**:
1. Run TanStack Router's `generate-routes` CLI to create the initial `routeTree.gen.ts`
2. Configure codegen to run as a Vite plugin (auto-runs in dev and build)
3. Create the index route and a dynamic route as examples
4. Verify that accessing a nonexistent param produces a TypeScript error

---

### 8. `beforeLoad` Middleware Integration (Route-Level Guards)

**Overview**: TanStack Router's `beforeLoad` hook runs before the loader, on the server during SSR. This is where route-level middleware guards execute. The Roost context is available through `getRequestEvent()`.

```typescript
// Reusable beforeLoad guard factory — Phase 3 (auth) uses this pattern
// Pattern: create a beforeLoad function that resolves from Roost context

import { redirect } from '@tanstack/react-router';
import { getRoostContext } from '@roostjs/start';
import { getRequestEvent } from '@tanstack/start/server';

/**
 * Creates a beforeLoad hook that requires an authenticated user.
 * Redirects to /auth/login if no session is present.
 * Phase 3 fills in the actual auth check — this is the scaffolding.
 */
export function requireAuth() {
  return async () => {
    const event = getRequestEvent()?.nativeEvent;
    if (!event) return;

    const { container } = getRoostContext(event);

    // Phase 3: const sessionManager = container.resolve(SessionManager);
    // const user = await sessionManager.currentUser(event);
    // if (!user) throw redirect({ to: '/auth/login' });

    // Placeholder until Phase 3:
    void container;
  };
}
```

**Key decisions**:
- `beforeLoad` receives `context` which includes anything returned by parent `beforeLoad` hooks. This is how auth context flows down the route tree — the root or a layout route's `beforeLoad` puts `user` into context, children read it via `Route.useRouteContext()`.
- `throw redirect(...)` is TanStack Router's way to redirect from `beforeLoad`. It throws, not returns, so TypeScript knows the function doesn't return a value when redirecting.
- This file is scaffolding. Phase 3 fills in `SessionManager` resolution.

---

### 9. `StartServiceProvider` (`packages/start/src/provider.ts`)

**Overview**: A service provider that Phase 3 and later phases can register, giving them access to the Roost context bridge without direct dependency on `@roostjs/start` internals.

```typescript
// packages/start/src/provider.ts
import { ServiceProvider } from '@roostjs/core';

/**
 * Registers TanStack Start integration services into the Roost container.
 * Register this provider in your Application setup:
 *
 * @example
 * ```typescript
 * app.register(StartServiceProvider);
 * ```
 */
export class StartServiceProvider extends ServiceProvider {
  register(): void {
    // Phase 2 has no services to register beyond what the middleware sets up.
    // This provider exists so Phase 3 (auth session manager) and Phase 4 (ORM)
    // can extend it or register alongside it in a known slot.
  }

  boot(): void {
    // Validate that the Roost middleware is configured.
    // In development, warn loudly if it's missing.
    if (this.app.config.get('app.env', 'production') === 'development') {
      // Validation logic runs during boot, before the first request.
    }
  }
}
```

**Key decisions**:
- The provider is intentionally empty in Phase 2. It exists to establish the pattern and give later phases a stable registration point.

---

## Data Model

No database schema in Phase 2. Routing and SSR are stateless. Phase 4 (ORM) adds schemas.

## API Design

### `@roostjs/start` Public API

```typescript
// packages/start/src/index.ts

// Context bridge — used inside server functions and loaders
export { getRoostContext, setRoostContext } from './context.js';
export type { RoostServerContext } from './context.js';

// Nitro middleware factory — used in app.config.ts
export { createRoostMiddleware } from './middleware.js';

// Server function wrapper
export { withRoost } from './server-fn.js';

// Service provider
export { StartServiceProvider } from './provider.js';
```

### Nitro Middleware Registration (User-Facing)

```typescript
// apps/my-app/src/nitro-middleware.ts (generated by `roost new`)
import { createRoostMiddleware } from '@roostjs/start';
import { Application } from '@roostjs/core';
import { CloudflareServiceProvider } from '@roostjs/cloudflare';

export default createRoostMiddleware((env) => {
  const app = new Application(env);
  app.register(CloudflareServiceProvider);
  // app.register(AuthServiceProvider);  // added in Phase 3
  return app;
});
```

## Testing Requirements

### Unit Tests

| Test File | Coverage |
|---|---|
| `packages/start/__tests__/context.test.ts` | set/get round-trip, missing context error, symbol isolation |
| `packages/start/__tests__/middleware.test.ts` | app boots once (cold start), scoped container per request, cloudflare env forwarding |
| `packages/start/__tests__/server-fn.test.ts` | context injection, missing event error, typed input/output |

**Key test cases**:
- Context: `setRoostContext` then `getRoostContext` returns identical object. Two events get independent contexts. `getRoostContext` on a bare event throws with the registration hint.
- Middleware: First call boots app and calls `cachedApp.boot()` once. Second call skips boot, creates new scoped container. `setRoostContext` called with the scoped container on every call.
- Server function: `withRoost` calls the wrapped function with the resolved context. Missing H3Event throws with a clear message.

```typescript
// Example test shape
import { describe, test, expect, beforeEach } from 'bun:test';
import { setRoostContext, getRoostContext } from '../src/context.js';

describe('context bridge', () => {
  test('set then get returns same context', () => {
    const mockEvent = { context: {} } as any;
    const mockCtx = { container: {}, app: {} } as any;

    setRoostContext(mockEvent, mockCtx);
    expect(getRoostContext(mockEvent)).toBe(mockCtx);
  });

  test('get on bare event throws with helpful message', () => {
    const mockEvent = { context: {} } as any;

    expect(() => getRoostContext(mockEvent)).toThrow(
      'Roost context not found on event'
    );
  });
});
```

## Error Handling

| Error Scenario | Handling Strategy |
|---|---|
| `getRoostContext` called before middleware runs | Throw `Error` with middleware registration instructions |
| `withRoost` called outside SSR context (client bundle) | Throw `Error` with "SSR only" message |
| App boot fails (provider throws) | Let error propagate from `createRoostMiddleware` — Worker returns 500, cold start fails loudly |
| Route loader throws | TanStack Router catches and renders `errorComponent` — standard framework behavior |
| `createFileRoute` path string mismatches file | TypeScript compile error from generated route tree — caught at build time |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
|---|---|---|---|---|
| `cachedApp` module cache | Stale app after Worker restart | Worker process restart clears module cache | New cold start — correct behavior | Document: cold starts are expected, providers must be idempotent |
| Nitro middleware order | Roost context not available | Middleware registered after TanStack Start handler | `getRoostContext` throws | Validate in `StartServiceProvider.boot()`, surface error at startup |
| Route tree codegen | Types out of sync | Route file added without regenerating | TypeScript type errors on `Link` / `useParams` | Codegen runs as Vite plugin in dev (auto), required step in CI build |
| Vinxi Cloudflare preset | Missing `executionContext` | Workers `ctx.waitUntil` not forwarded | Background tasks fail silently | Nitro preset forwards `ctx` — verify in wrangler.toml worker type setting |
| `withRoost` in client bundle | Server function leaked to client | Incorrect import in a client component | Build error or runtime fetch error | Vinxi's server function tree-shaking catches this; add a lint rule for explicit `.server.ts` suffix |

## Validation Commands

```bash
# Type checking (all packages including start)
bun run --filter '@roostjs/*' tsc --noEmit

# Unit tests
bun test --filter packages/start

# All unit tests
bun test

# Build playground (verifies Nitro Cloudflare preset works)
cd apps/playground && bun run build

# Dev server (manual verification of HMR and SSR)
cd apps/playground && bun run dev

# Verify route tree is up to date
cd apps/playground && bun run generate-routes
```
