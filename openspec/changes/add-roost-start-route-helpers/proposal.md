# Add Roost-Aware TanStack Start Route Helpers

## Summary

Add route-level helpers to `@roostjs/start` so TanStack Start loaders and `beforeLoad` hooks can use Roost services without exposing the Roost application, container, database clients, or request-scoped dependencies to the browser.

The new API should make server-backed route data feel natural:

```ts
// src/roost.ts
export const { roostLoader, roostBeforeLoad } = createRoostStart({
  app: createApp,
})

// src/routes/posts.tsx
export const Route = createFileRoute('/posts')({
  loader: roostLoader(async ({ resolve }) => {
    return resolve(PostService).list()
  }),
})
```

and route guards/context projection concise:

```ts
export const Route = createFileRoute('/_app')({
  beforeLoad: roostBeforeLoad(async ({ resolve }) => {
    const session = await resolve(AuthService).currentSession()

    return {
      userId: session?.user.id ?? null,
      orgId: session?.organization.id ?? null,
    }
  }),
})
```

## Motivation

`@roostjs/start` currently provides `roostFn` and `roostFnWithInput`, which wrap TanStack Start server functions and inject a request-scoped Roost context. That works well for callable server functions, but route loaders are the first place users reach for route-load data.

TanStack Start route loaders and `beforeLoad` hooks are isomorphic. They can run on the server during SSR and in the browser during client navigation/preload. Because Roost services may depend on server-only infrastructure, a Roost route helper must keep all Roost-specific work behind a server boundary even when invoked by client-side navigation.

Without a route-specific helper, users have unattractive options:

- Call `context.roost.container.resolve(...)`, which is verbose and easy to misuse.
- Call `createRoostContext(getApp())` manually, which depends on boot ordering and bypasses the existing middleware/server function path.
- Wrap every loader in a hand-written `roostFn`, which is safe but noisy.

## Goals

- Provide a loader counterpart to `roostFn`.
- Provide a `beforeLoad` counterpart for guards and serializable route context.
- Keep Roost container/service resolution server-side even when TanStack invokes the loader from the browser.
- Make the common operation `resolve(PostService)` easy to remember.
- Preserve TanStack Router semantics for params, search, route context, preload, invalidation, thrown redirects, and route errors.
- Keep `@roostjs/start` a thin adapter over TanStack Start, not a replacement framework.

## Non-Goals

- Do not make `context.roost.container.resolve(...)` the promoted user-facing route API.
- Do not inject raw Roost context, containers, service instances, DB clients, or secrets into client-visible router context.
- Do not force apps to use `roostBeforeLoad` just so `roostLoader` can access auth/user/org context. Roost services should read that from the request-scoped server container.
- Do not introduce a large configurable error-policy framework in this change.
- Do not replace ordinary TanStack loaders for local, public, or isomorphic data.

## Research Notes

Several adjacent frameworks solve this by creating request context once at the framework boundary and then exposing small downstream helpers:

- TanStack Router documents router context as a dependency-injection mechanism for loaders and routes, but TanStack Start loaders remain isomorphic.
- Better Auth's TanStack Start integration uses server functions from route hooks for server-side auth checks.
- SaaS.js's TanStack Start kit exposes typed context such as `context.trpc...ensureData(...)`, giving route code a short isomorphic caller rather than raw server internals.
- SvelteKit populates `event.locals` in server hooks and exposes it to server load/actions/endpoints.
- Nuxt/H3 uses `event.context` for request-scoped server data.
- React Router framework middleware is moving toward typed context providers for loader/action context.
- Hono and RedwoodSDK both use request-scoped context objects populated by middleware and consumed downstream.

The pattern to copy is not "put all server internals in route context"; it is "make server context available at the boundary, then expose narrow helpers at the places users write route code."

## Proposed API

The package should add a configured helper factory as the primary DX:

```ts
const roost = createRoostStart({ app })

export const {
  middleware: roostMiddleware,
  fn: roostFn,
  loader: roostLoader,
  beforeLoad: roostBeforeLoad,
} = roost
```

This factory should bind the Roost app/middleware once and return helpers that do not require users to pass `roostMiddleware` at every call site.

The package may also expose low-level helper builders for advanced use:

```ts
import { createRoostLoader, createRoostBeforeLoad } from '@roostjs/start'

export const roostLoader = createRoostLoader(roostMiddleware)
export const roostBeforeLoad = createRoostBeforeLoad(roostMiddleware)
```

The low-level form is useful for users who already construct middleware manually, but the docs should lead with `createRoostStart`.

## User Experience

Simple route data:

```ts
import { roostLoader } from '../roost'

export const Route = createFileRoute('/posts')({
  loader: roostLoader(async ({ resolve }) => {
    return resolve(PostService).list()
  }),
  component: PostsRoute,
})
```

Parameterized route data:

```ts
import { roostLoader } from '../roost'

export const Route = createFileRoute('/posts/$postId')({
  loader: roostLoader(async ({ params, resolve }) => {
    return resolve(PostService).find(params.postId)
  }),
})
```

Route guard:

```ts
import { roostBeforeLoad } from '../roost'

export const Route = createFileRoute('/_app')({
  beforeLoad: roostBeforeLoad(async ({ resolve, location }) => {
    const auth = resolve(AuthService)

    if (!(await auth.currentUser())) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }
  }),
})
```

Public route context projection:

```ts
import { roostBeforeLoad } from '../roost'

export const Route = createFileRoute('/_app')({
  beforeLoad: roostBeforeLoad(async ({ resolve }) => {
    const session = await resolve(AuthService).currentSession()

    return {
      userId: session?.user.id ?? null,
      orgId: session?.organization.id ?? null,
    }
  }),
})
```

## Open Questions

- Should `roostLoader` accept optional metadata such as `key` for debugging and development warnings?

## Spike Findings

A local TanStack Start app generated with `roost-local new` verified:

- Route loaders and `beforeLoad` hooks can run in the browser.
- A browser-invoked loader can call a TanStack `createServerFn`; the route code runs in the browser while the server function runs on the server.
- A browser-invoked `beforeLoad` can call a TanStack `createServerFn` with the same split.
- `redirect(...)` thrown inside a server function is rethrown on the client as a TanStack-recognizable redirect with serialized `options`.
- `notFound()` thrown inside a server function is rethrown on the client as a TanStack-recognizable not-found object.

The route helper should therefore avoid wrapping or translating these errors unless implementation proves a specific edge case requires it.
