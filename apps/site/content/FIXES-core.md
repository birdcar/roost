# Audit: @roost/core

## Status: FIXED

## Exports verified

From `packages/core/src/index.ts`:

- `RoostContainer` (class)
- `ServiceProvider` (abstract class)
- `ConfigManager` (class)
- `Pipeline` (class)
- `Application` (class)
- `Container` (interface, type export)
- `Token` (type export)
- `Factory` (type export)
- `Middleware` (interface, type export)
- `MiddlewareClass` (type export)
- `Handler` (type export)
- `ServiceProviderClass` (type export)

## Discrepancies found and fixed

| File | Issue | Fix applied |
|------|-------|-------------|
| `reference/core.mdx` | `scoped()` documented as returning `RoostContainer` — source returns `Container` (interface) | Changed return type to `Container` |
| `reference/core.mdx` | `flush(): void` documented on `RoostContainer` — method does not exist in source | Removed entirely |
| `reference/core.mdx` | `Pipeline.handle()` second parameter named `handler` — source names it `destination` | Corrected parameter name to `destination` |
| `reference/core.mdx` | `withContainer(container: RoostContainer)` — source types parameter as `Container` interface | Changed to `Container` |
| `reference/core.mdx` | `ServiceProvider` documented as having `container: RoostContainer` property — source has `protected app: Application` only | Replaced with `app: Application` and noted `this.app.container` for container access |
| `reference/core.mdx` | `Token<T>` type wrong: `abstract new (...args: any[]) => T \| symbol \| string` (wrong precedence, wrong order) — source: `(abstract new (...args: any[]) => T) \| string \| symbol` | Corrected to match source |
| `reference/core.mdx` | `Factory<T>` typed as `(container: RoostContainer) => T` — source uses `Container` interface | Changed to `Container` |
| `reference/core.mdx` | `Middleware` documented as a function type `(request, next) => Promise<Response>` — source defines it as an interface with a `handle()` method that also accepts `...args: string[]` | Replaced type alias with correct `interface Middleware { handle(...) }` |
| `reference/core.mdx` | `MiddlewareClass` constructor args typed as `string[]` — source uses `any[]` | Changed to `any[]` |
| `reference/core.mdx` | Error classes (`BindingNotFoundError`, `CircularDependencyError`, `ConfigKeyNotFoundError`) documented as part of the public API — none are exported from `index.ts` | Added note that these are not exported; updated section prose accordingly |
| `guides/core.mdx` | `ServiceProvider` example uses `this.container.singleton(...)` and `this.container.resolve(...)` — `container` is not a property on `ServiceProvider`; it is `app.container` | Updated to `this.app.container` |

## Files modified

- `apps/site/content/docs/reference/core.mdx`
- `apps/site/content/docs/guides/core.mdx`

## Items requiring human review

- **Error class exports**: `BindingNotFoundError`, `CircularDependencyError`, and `ConfigKeyNotFoundError` are thrown at runtime but not exported from `@roost/core`. Users who want to catch them by type currently cannot do so cleanly. Consider either exporting them from `index.ts` or documenting an alternative error-handling pattern (e.g., checking `.name` on the caught error).
- **`Middleware` as interface vs. function**: The docs previously showed `Middleware` as a plain function type matching `Handler`'s shape. The actual interface requires a `handle()` method, meaning plain arrow functions are **not** valid `Middleware` values — they must be objects with a `handle` method. The function-based examples in `guides/core.mdx` (`rateLimitMiddleware`, `rateLimit`) type their return as `Handler`, not `Middleware`, which is correct, but this distinction may be worth a callout in the guides.
- **`ServiceProviderClass` type**: References `import('./provider.js').ServiceProvider` internally. If docs ever show the `ServiceProviderClass` type verbatim, it should reflect that it expects a constructor taking an `Application` argument: `new (app: Application) => ServiceProvider`.
