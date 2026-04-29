# Tasks

## Implementation

- [x] Add `createRoostStart({ app })` to bind a Roost app factory once and return configured helpers.
- [x] Ensure `createRoostStart` returns `middleware`, `fn`, `loader`, and `beforeLoad`.
- [x] Add `roostLoader` to `packages/start/src/server-fn.ts` or a new route helper module.
- [x] Add `roostBeforeLoad` to the same helper surface.
- [x] Add low-level `createRoostLoader(roostMiddleware)` and `createRoostBeforeLoad(roostMiddleware)` builders if useful for implementation clarity.
- [x] Export both helpers from `packages/start/src/index.ts`.
- [x] Preserve the existing `roostFn` and `roostFnWithInput` API.
- [x] Add a bound `fn` helper on the configured instance that supports both no-input and validated-input usage.
- [x] Keep Roost handler execution behind a TanStack server function boundary.
- [x] Bind `resolve` to the request-scoped Roost container before passing it to handlers.
- [x] Pass only serializable route args across the server function boundary.
- [x] Preserve thrown TanStack redirects and not-found route control flow by avoiding unnecessary catch/wrap logic.

## Types

- [x] Define route helper context types for `roost`, `app`, and `resolve`.
- [x] Preserve useful inference for loader return values.
- [x] Preserve useful inference for `beforeLoad` return context.
- [x] Type `params`, `search`, `location`, and existing route `context` as closely as TanStack route APIs allow.
- [x] Avoid leaking raw `Application`, `Container`, or service instance types into client-visible route context.

## Tests

- [x] Test that `roostLoader` resolves a service from a scoped container.
- [x] Test that separate loader calls receive separate scoped containers.
- [x] Test that `roostLoader` can receive route params.
- [x] Test that a client-invoked `roostLoader` calls the server function boundary.
- [x] Test that `roostBeforeLoad` can return serializable route context.
- [x] Test that a client-invoked `roostBeforeLoad` calls the server function boundary.
- [x] Test that `roostBeforeLoad` can throw a TanStack redirect.
- [x] Test that `roostLoader` can throw a TanStack not-found error.
- [x] Test that `roostLoader` does not call the handler directly on the client path.
- [x] Test that non-serializable route args are omitted or rejected with a clear error.

## Documentation

- [x] Update `packages/start/README.md` with `roostLoader` and `roostBeforeLoad`.
- [x] Update `apps/site/content/docs/guides/start.mdx` with route-loader examples.
- [x] Update `apps/site/content/docs/reference/start.mdx` with API reference entries.
- [x] Add guidance explaining when to use normal TanStack loaders vs `roostLoader`.
- [x] Add guidance explaining that `roostBeforeLoad` is optional and only needed for guards or public route context projection.
- [x] Add a caching note: expose public cache-relevant context when needed and call `router.invalidate()` after session/org changes.

## Follow-Up Evaluation

- [ ] Decide whether route helper metadata such as `key` improves debugging enough to include.
- [ ] Decide whether any known Roost domain errors deserve tiny helper utilities, without adding a broad error policy layer.
