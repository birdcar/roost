# PRD: Roost Framework - Phase 6

**Contract**: ./contract.md
**Phase**: 6 of 11
**Focus**: Background job processing with Cloudflare Queues

## Phase Overview

Phase 6 gives Roost apps background job processing. Cloudflare Queues provide the infrastructure, but the DX today is raw consumer handlers with untyped messages. Roost wraps this in a Laravel-like job abstraction: define a job class, dispatch it, and the framework handles serialization, retry, dead letter, and monitoring.

This phase depends only on Phase 1 (Queues binding from @roost/cloudflare). It can run in parallel with Phases 2-5. The job infrastructure doesn't need routing, auth, or ORM — it's a pure background processing layer.

After this phase, a developer can define `class SendWelcomeEmail extends Job`, dispatch it from anywhere, configure retry strategies, and monitor job status — all on Cloudflare Queues.

## User Stories

1. As a Roost app developer, I want to define jobs as classes so that background work is organized and typed.
2. As a Roost app developer, I want to dispatch jobs from anywhere (routes, models, other jobs) with a clean API.
3. As a Roost app developer, I want configurable retry strategies so that transient failures are handled automatically.
4. As a Roost app developer, I want dead letter handling so that permanently failed jobs don't block the queue.
5. As a Roost app developer, I want job chaining so that I can define multi-step workflows.
6. As a Roost app developer, I want to monitor job status so that I know what's processing, failing, and stuck.

## Functional Requirements

### Job Base Class (@roost/queue)

- **FR-6.1**: `Job` base class with typed payload and `handle()` method
- **FR-6.2**: Job configuration via decorators: `@Queue('name')`, `@Delay(seconds)`, `@MaxRetries(n)`, `@RetryAfter(seconds)`
- **FR-6.3**: Job `handle()` receives typed payload and has access to service container
- **FR-6.4**: Jobs auto-serialized to JSON for Cloudflare Queues message format

### Dispatch API

- **FR-6.5**: `Job.dispatch(payload)` — enqueue immediately
- **FR-6.6**: `Job.dispatchAfter(seconds, payload)` — delayed dispatch
- **FR-6.7**: `Job.chain([job1, job2, job3])` — sequential execution
- **FR-6.8**: `Job.batch([job1, job2, job3])` — parallel execution with batch completion callback
- **FR-6.9**: Dispatch from anywhere — routes, models, other jobs, middleware

### Queue Consumer

- **FR-6.10**: Wrangler `queue` handler integration — maps incoming messages to Job classes
- **FR-6.11**: Job deserialization from queue message to typed Job instance
- **FR-6.12**: Automatic retry with configurable backoff (fixed, exponential)
- **FR-6.13**: Dead letter queue for jobs exceeding max retries
- **FR-6.14**: Concurrency configuration per queue

### Job Lifecycle

- **FR-6.15**: Job events: `dispatched`, `processing`, `processed`, `failed`, `retrying`
- **FR-6.16**: `onFailure(error)` hook on job class for custom failure handling
- **FR-6.17**: `onSuccess()` hook for post-completion actions
- **FR-6.18**: Job timeout configuration with automatic failure on exceed

### Monitoring (Horizon-lite)

- **FR-6.19**: Job metrics stored in KV: processed count, failed count, avg duration
- **FR-6.20**: API endpoint for querying job metrics (used by Phase 10 examples and future dashboard)
- **FR-6.21**: Failed job storage with payload, error, and stack trace for inspection

## Non-Functional Requirements

- **NFR-6.1**: Job dispatch overhead < 5ms (time to enqueue, not including queue latency)
- **NFR-6.2**: Job deserialization overhead < 2ms per message
- **NFR-6.3**: Retry backoff calculations are deterministic and testable
- **NFR-6.4**: Queue consumer handles batch messages efficiently (Cloudflare Queues batches)

## Dependencies

### Prerequisites

- Phase 1 complete (Queues binding, KV binding for metrics, service container)

### Outputs for Next Phase

- Job dispatch pattern for Phase 7 Billing's webhook processing
- Job monitoring API for Phase 10 example apps
- Queue consumer infrastructure for Phase 8 CLI configuration
- Job testing fakes for Phase 9 testing utilities

## Acceptance Criteria

- [ ] A job class with typed payload dispatches to Cloudflare Queues
- [ ] Queue consumer receives message, deserializes, and calls `handle()`
- [ ] Retry fires automatically on job failure with configured backoff
- [ ] Dead letter queue receives jobs that exceed max retries
- [ ] `Job.chain([a, b, c])` executes jobs sequentially
- [ ] `Job.batch([a, b, c])` executes in parallel with completion callback
- [ ] Job events fire correctly for each lifecycle stage
- [ ] Failed jobs store payload and error details for inspection
- [ ] Job metrics are queryable via API
- [ ] `bun test` covers dispatch, consume, retry, and dead letter paths
