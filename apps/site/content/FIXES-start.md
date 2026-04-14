# Audit: @roostjs/start

## Status: FIXED

## Exports verified
- `createRoostMiddleware` (from `./middleware.js`)
- `RoostMiddlewareContext` (type, from `./middleware.js`)
- `bootApp`, `getApp`, `createRoostContext`, `resetAppCache` (from `./context.js`)
- `roostFn`, `roostFnWithInput` (from `./server-fn.js`)
- `StartServiceProvider` (from `./provider.js`)
- `RoostServerContext` (type, from `./types.js`)

## Discrepancies found and fixed
| File | Issue | Fix applied |
|------|-------|-------------|
| `apps/site/content/docs/reference/start.mdx` | `bootApp`, `getApp`, `createRoostContext`, `resetAppCache` are all exported from `./context.js` but none are documented in the reference | Added a Context Utilities section documenting all four functions |
| `apps/site/content/docs/reference/start.mdx` | `RoostMiddlewareContext` type is exported but not mentioned | Added to the Types section |
| `apps/site/content/docs/reference/start.mdx` | `StartServiceProvider` is exported but not documented | Added a `StartServiceProvider` section |
| `apps/site/content/docs/concepts/start.mdx` | Concepts page links to `/docs/packages/start` but the actual path is `/docs/reference/start` | No fix applied — this is a site routing concern, not a content accuracy issue. Flagged for review. |

## Files modified
- `apps/site/content/docs/reference/start.mdx`

## Items requiring human review
- `resetAppCache` is used for testing (clears the cached app singleton). Consider whether it belongs in the reference doc or only in the testing docs.
- Concepts and guides cross-links use `/docs/packages/...` paths which may or may not match the actual site routing.
