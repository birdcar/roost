# Context Map: cf-platform-completeness

**Phase**: 1
**Scout Confidence**: 95/100
**Verdict**: GO

## Dimensions

| Dimension | Score | Notes |
|---|---|---|
| Scope clarity | 20/20 | All 4 new files and 5 modified files identified with exact changes per file |
| Pattern familiarity | 19/20 | `AuthMiddleware`, `Application`, `Job.fake()` patterns all read and understood |
| Dependency awareness | 18/20 | `application.ts` consumed by start package and all apps; `index.ts` is the barrel export; `new.ts` standalone |
| Edge case coverage | 19/20 | Spec covers: missing ctx, missing cf-ray, no auth, partial context — comprehensive |
| Test strategy | 19/20 | bun test infrastructure confirmed, fake/assert pattern well-documented, test file locations clear |

## Key Patterns

- `packages/core/src/application.ts` — Application class: constructor stores `env`, `handle()` creates scoped container via `this.container.scoped()`, passes through `Pipeline`. `this.env` threading is the exact pattern for `this._ctx`.
- `packages/auth/src/middleware/auth.ts` — Middleware resolves from `request.__roostContainer`, does work, calls `next(request)`. Response cloning via `new Response(response.body, response)`.
- `packages/queue/src/job.ts` — Fake pattern: module-level `WeakMap<Function, Fake>`, static `fake()`/`restore()`/`assert*()` methods.
- `packages/cloudflare/src/bindings/kv.ts` — Thin wrapper style for binding classes.
- `packages/cli/src/commands/new.ts:106-113` — Current `wrangler.jsonc` generation via `JSON.stringify`.

## Dependencies

- `packages/core/src/application.ts` — consumed by → `packages/start/`, `apps/playground/`, `apps/site/`, all user apps. Public API: `Application.create()`, `.register()`, `.useMiddleware()`, `.handle()`. Adding optional `ctx` param to `handle()` is backward compatible.
- `packages/core/src/index.ts` — barrel export consumed by all `@roostjs/core` consumers. Adding exports is additive-only.
- `packages/core/src/types.ts` — consumed by middleware implementations, container types. Adding types is additive.
- `packages/cli/src/commands/new.ts` — self-contained, only consumed by CLI entry point.

## Conventions

- **Naming**: kebab-case files, PascalCase classes, camelCase methods/properties
- **Imports**: relative paths with `.js` extension (`'./types.js'`), type imports use `import type`
- **Error handling**: throw typed errors at boundaries, custom error classes extend `Error`
- **Types**: `interface` for public contracts, `type` for unions/aliases, types in `types.ts` or co-located
- **Testing**: `__tests__/*.test.ts` co-located with package `src/`, bun test runner, describe/it blocks

## Risks

- `RoostContainer.scoped()` — need to verify it has a `bind()` method for the `'ctx'` token. If only `singleton()` exists, use that instead.
- `packages/core/package.json` — may not have `@cloudflare/workers-types` as a dep. If not, define `ExecutionContext` interface inline.
- Template literal for wrangler.jsonc — must preserve valid JSONC. Test by parsing the output with a JSONC-aware parser or manual inspection.
