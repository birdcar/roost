# Design: Roost-Aware TanStack Start Route Helpers

## Context

`@roostjs/start` currently bridges Roost into TanStack Start with:

- `createRoostMiddleware(createApp)` to boot the Roost application and attach a request-scoped `roost` object to TanStack middleware context.
- `roostFn(middleware, fn)` to run a GET server function with `roost` pre-injected.
- `roostFnWithInput(middleware, validator, fn)` to run a POST server function with typed input and `roost` pre-injected.

The gap is route data. TanStack Start route `loader` and `beforeLoad` are the natural place to fetch route data and run route guards, but they are isomorphic. A helper that resolves Roost services directly in the loader body would be unsafe when the same loader runs in the browser.

## Decision

Add `roostLoader` and `roostBeforeLoad` as route adapters that execute user-supplied Roost work behind a TanStack server function boundary.

The route helper itself is callable from either server or client. The Roost handler passed to the helper runs on the server with the same request-scoped context semantics as `roostFn`.

## API Shape

Preferred user-facing shape:

```ts
// src/roost.ts
export const {
  middleware: roostMiddleware,
  fn: roostFn,
  loader: roostLoader,
  beforeLoad: roostBeforeLoad,
} = createRoostStart({ app: createApp })

// src/routes/posts.tsx
export const Route = createFileRoute('/posts')({
  loader: roostLoader(async ({ params, location, context, resolve }) => {
    return resolve(PostService).list()
  }),
})
```

The configured instance binds the Roost app and middleware once. Route files import already-bound helpers, so users do not repeat `roostMiddleware` at every call site.

Low-level builders may exist for advanced users:

```ts
const roostLoader = createRoostLoader(roostMiddleware)
const roostBeforeLoad = createRoostBeforeLoad(roostMiddleware)
```

Existing helpers should remain available:

```ts
roostFn(roostMiddleware, handler)
roostFnWithInput(roostMiddleware, validator, handler)
```

The configured instance should expose one bound `fn` helper with input optionality instead of forcing users to choose between two concepts:

```ts
roost.fn(handler)
roost.fn({ input: validator }, handler)
```

`roostFnWithInput` remains as a backward-compatible low-level export, but new docs should lead with the unified configured helper.

## Handler Context

The handler receives a curated context object:

```ts
type RoostRouteHandlerContext<TArgs> = TArgs & {
  roost: RoostServerContext
  app: Application
  resolve: RoostServerContext['container']['resolve']
}
```

`resolve` is bound to the request-scoped container:

```ts
const resolve = roost.container.resolve.bind(roost.container)
```

`resolve` is not a reserved word and does not conflict with JavaScript or TypeScript syntax. It matches the existing container API and is broad enough for services, context objects, config, bindings, and token-based dependencies.

The full `roost` object remains available as an escape hatch.

## Server Boundary

The implementation should use `createServerFn` internally, equivalent to:

```ts
const run = createServerFn({ method: 'POST' })
  .middleware([roostMiddleware])
  .inputValidator(validateSerializableRouteInput)
  .handler(async ({ context, data }) => {
    const roost = context.roost

    return handler({
      ...data,
      roost,
      app: roost.app,
      resolve: roost.container.resolve.bind(roost.container),
    })
  })
```

The actual code should preserve the route helper call signature and types as much as TanStack allows.

`createRoostStart({ app })` should construct the middleware using `createRoostMiddleware(app)` and then bind all helper builders to that middleware.

## Route Args

Only serializable loader/beforeLoad data should cross the server function boundary.

Allowed by default:

- `params`
- `location.href`
- `location.pathname`
- `location.search`
- `loaderDeps` / `deps` if present and serializable
- `context`, only when it is serializable public route context

Not allowed:

- functions
- class instances
- `Request`
- `Response`
- `Container`
- service instances
- raw `Application`
- raw `RoostServerContext`

The first implementation should pass a minimal route args object and expand from there. The spike verified that passing simple params and location strings through `createServerFn` works. Full TanStack route args should not be forwarded wholesale.

## Caching

`roostLoader` does not own TanStack Router caching. It returns a normal loader function, so TanStack remains responsible for loader caching, stale timing, preload behavior, and invalidation.

Roost data may depend on hidden server context such as user, organization, tenant, flags, locale, cookies, or permissions. That is normal for server-backed route data.

The recommended pattern is:

- Use `roostLoader` alone when the route data can be cached by URL/search/normal route dependencies.
- Add `roostBeforeLoad` when the app wants to project public, serializable context such as `userId`, `orgId`, or `flagVersion` into TanStack route context.
- Call `router.invalidate()` after login, logout, organization switch, or other session/context changes.

Do not require `roostBeforeLoad` for `roostLoader` to read user/org/tenant context. Roost services should resolve that from the request-scoped server container.

## Errors and Redirects

This change should not introduce a broad error mapping framework.

The minimum requirement is that `roostLoader` and `roostBeforeLoad` preserve TanStack route control-flow behavior:

- thrown `redirect(...)` should behave like it was thrown from a normal loader/beforeLoad
- thrown `notFound(...)` should behave like it was thrown from a normal loader/beforeLoad
- unexpected errors should surface to TanStack error handling without being hidden behind generic wrapper errors

The spike verified that TanStack server functions preserve both redirect and not-found control flow across the client/server boundary. The implementation should avoid catch/wrap logic around handler execution unless a future edge case requires it.

## Why Not Inject `roost` Into Router Context Directly?

Raw router context is tempting:

```ts
loader: async ({ context }) => {
  return context.roost.container.resolve(PostService).list()
}
```

But it has three problems:

- TanStack Start loaders can run in the browser.
- `context.roost` contains server-only objects.
- The API encourages users to treat a request-scoped server container as route-visible client context.

It is still reasonable for advanced integrations to inject public, serializable route context such as `userId`, `orgId`, or feature flag snapshots. It is not the promoted mechanism for service resolution.

## Why Not `createRoostContext(getApp())` In Loaders?

This is concise but brittle:

```ts
const roost = createRoostContext(getApp())
```

It depends on `getApp()` having already been booted, duplicates framework lifecycle work, and does not protect against client-side loader execution. It should remain an internal utility and escape hatch, not the documented route-loader pattern.

## Documentation

Docs should frame the split clearly:

- Use normal TanStack loaders for local, public, or isomorphic data.
- Use `roostLoader` when route data needs Roost services or server-only resources.
- Use `roostBeforeLoad` for route guards and for projecting small public context into the route tree.
- Use `roostFn` / `roostFnWithInput` for server functions invoked outside the route lifecycle.
