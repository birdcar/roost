# Audit: @roostjs/queue

## Status: FIXED

## Exports verified
- `Job` (from `./job.js`)
- `JobRegistry` (from `./registry.js`)
- `JobConsumer` (from `./consumer.js`)
- `Dispatcher` (from `./dispatcher.js`)
- `QueueServiceProvider` (from `./provider.js`)
- `Queue`, `Delay`, `MaxRetries`, `RetryAfter`, `Backoff`, `JobTimeout`, `getJobConfig` (from `./decorators.js`)
- `JobConfig`, `JobMessage`, `SerializedJob`, `FailedJobRecord`, `JobMetrics`, `BackoffStrategy` (types)

## Discrepancies found and fixed
| File | Issue | Fix applied |
|------|-------|-------------|
| `apps/site/content/docs/reference/queue.mdx` | `Dispatcher` is exported but not documented | Added `Dispatcher` section |
| `apps/site/content/docs/reference/queue.mdx` | `Queue`, `Delay`, `JobTimeout`, `getJobConfig` decorators are exported but not documented — only `MaxRetries`, `Backoff`, `RetryAfter` are covered | Added `@Queue`, `@Delay`, `@JobTimeout`, and `getJobConfig` to the Decorators section |
| `apps/site/content/docs/reference/queue.mdx` | `JobRegistry.register()` documents `typeof Job` parameter but the actual decorator exports include `Queue` and `Delay` which are not mentioned in the Job API section | No fix needed — registry signature is accurate |

## Files modified
- `apps/site/content/docs/reference/queue.mdx`

## Items requiring human review
- None
