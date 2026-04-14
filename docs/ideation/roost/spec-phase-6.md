# Implementation Spec: Roost Framework - Phase 6

**Contract**: ./contract.md
**PRD**: ./prd-phase-6.md
**Estimated Effort**: L

## Technical Approach

Phase 6 builds `@roostjs/queue` — a Laravel Horizon-inspired job abstraction over Cloudflare Queues. The core pattern: every background job is a class, dispatching is a static method call, and a registry maps message type names to job classes inside the Wrangler `queue` consumer handler.

The architecture has three distinct runtime contexts:

1. **Dispatch time** (inside a Worker `fetch` handler): `Job.dispatch()` serializes the payload with job class metadata and sends it to the `QueueSender` from `@roostjs/cloudflare`. This is synchronous from the caller's perspective — it enqueues and moves on.

2. **Consume time** (inside the Wrangler `queue` handler): A `JobConsumer` receives a batch of raw Cloudflare `MessageBatch`, looks up each message's job name in a `JobRegistry`, instantiates the job class, and calls `handle()`. Retries and acknowledgment are managed here.

3. **Monitoring** (read path): A thin KV-backed store accumulates processed/failed counts and average duration per job class. A query function reads these for the metrics API.

Decorators set job configuration as static metadata on the class. Using static class properties (rather than TC39 decorators with metadata) keeps this runtime-safe and Workers-compatible — no `Reflect.metadata` needed.

Chaining is implemented as a special payload envelope: the first job in a chain, on success, dispatches the next job in the list. Batches dispatch all jobs immediately and use a KV counter to track completion, firing the callback when the counter reaches zero.

## Feedback Strategy

**Inner-loop command**: `bun test --filter packages/queue`

**Playground**: `bun:test` suite — all queue behavior (dispatch, consume, retry, dead letter, chain, batch, monitoring) is exercised without a real Cloudflare Queues binding. The `QueueSender` mock captures sent messages. The `JobConsumer` runs synchronously in tests.

**Why this approach**: Queue consumers are pure logic — receive message, find job class, call handle, acknowledge or retry. All of this is testable in-process. The only thing that touches a real binding in production is `QueueSender.send()`, which is already mocked in Phase 1's cloudflare tests.

## File Changes

### New Files

| File Path | Purpose |
|---|---|
| `packages/queue/package.json` | @roostjs/queue package manifest |
| `packages/queue/tsconfig.json` | Extends base TS config |
| `packages/queue/src/index.ts` | Public API barrel export |
| `packages/queue/src/job.ts` | Job base class with typed payload generic |
| `packages/queue/src/decorators.ts` | @Queue, @Delay, @MaxRetries, @RetryAfter decorators |
| `packages/queue/src/registry.ts` | JobRegistry — maps job name strings to Job classes |
| `packages/queue/src/consumer.ts` | JobConsumer — Wrangler queue handler integration |
| `packages/queue/src/dispatcher.ts` | Dispatcher — resolves QueueSender, handles chain/batch envelopes |
| `packages/queue/src/retry.ts` | Backoff strategies (fixed, exponential) |
| `packages/queue/src/monitor.ts` | KV-backed job metrics store |
| `packages/queue/src/failed-jobs.ts` | Failed job storage and inspection API |
| `packages/queue/src/events.ts` | Job lifecycle event types and emitter |
| `packages/queue/src/types.ts` | Shared type definitions |
| `packages/queue/src/provider.ts` | QueueServiceProvider |
| `packages/queue/__tests__/job.test.ts` | Job base class and decorator tests |
| `packages/queue/__tests__/dispatcher.test.ts` | Dispatch, chain, batch tests |
| `packages/queue/__tests__/consumer.test.ts` | Consumer, retry, dead letter tests |
| `packages/queue/__tests__/monitor.test.ts` | Metrics accumulation and query tests |
| `packages/queue/__tests__/fake.test.ts` | Job.fake() and assertion tests |

### Modified Files

| File Path | Change |
|---|---|
| `packages/cloudflare/src/bindings/queues.ts` | Add `sendBatch` convenience if not already present (Phase 1 already defines QueueSender) |
| `package.json` (root) | workspace already includes `packages/*` — no change needed |

## Implementation Details

### 1. Job Base Class and Decorators

**Overview**: `Job<TPayload>` is an abstract class that user-defined jobs extend. It carries the payload as a typed instance property. Static methods (`dispatch`, `dispatchAfter`, `chain`, `batch`) are defined on the base class and delegate to the `Dispatcher` singleton. Decorators write configuration to static properties on the subclass — no reflection, no `Reflect.metadata`.

```typescript
// packages/queue/src/types.ts

export type BackoffStrategy = 'fixed' | 'exponential';

export interface JobConfig {
  queue: string;
  maxRetries: number;
  retryAfter: number;     // seconds
  delay: number;          // seconds
  backoff: BackoffStrategy;
  timeout: number;        // seconds, 0 = no limit
}

export interface JobMessage<TPayload = unknown> {
  jobName: string;        // matches registry key, e.g. "SendWelcomeEmail"
  payload: TPayload;
  attempt: number;        // 1-based retry count
  dispatchedAt: string;   // ISO timestamp
  chainedJobs?: SerializedJob[];   // remaining chain jobs, if any
  batchId?: string;       // present if part of a batch
}

export interface SerializedJob {
  jobName: string;
  payload: unknown;
}

export interface FailedJobRecord {
  id: string;
  jobName: string;
  payload: unknown;
  error: string;
  stack: string | undefined;
  attempt: number;
  failedAt: string;       // ISO timestamp
}

export interface JobMetrics {
  jobName: string;
  processedCount: number;
  failedCount: number;
  avgDurationMs: number;
  lastProcessedAt: string | null;
}
```

```typescript
// packages/queue/src/decorators.ts
//
// Decorators write to static properties on the class. They must run before
// any Job.dispatch() call, which happens naturally since decorators execute
// at class definition time.

import type { BackoffStrategy, JobConfig } from './types.ts';

const DEFAULT_CONFIG: JobConfig = {
  queue: 'default',
  maxRetries: 3,
  retryAfter: 60,
  delay: 0,
  backoff: 'fixed',
  timeout: 0,
};

function ensureConfig(target: typeof Job): JobConfig {
  if (!Object.prototype.hasOwnProperty.call(target, '_jobConfig')) {
    target._jobConfig = { ...DEFAULT_CONFIG };
  }
  return target._jobConfig;
}

export function Queue(name: string) {
  return function (target: typeof Job) {
    ensureConfig(target).queue = name;
  };
}

export function Delay(seconds: number) {
  return function (target: typeof Job) {
    ensureConfig(target).delay = seconds;
  };
}

export function MaxRetries(n: number) {
  return function (target: typeof Job) {
    ensureConfig(target).maxRetries = n;
  };
}

export function RetryAfter(seconds: number) {
  return function (target: typeof Job) {
    ensureConfig(target).retryAfter = seconds;
  };
}

export function Backoff(strategy: BackoffStrategy) {
  return function (target: typeof Job) {
    ensureConfig(target).backoff = strategy;
  };
}

export function Timeout(seconds: number) {
  return function (target: typeof Job) {
    ensureConfig(target).timeout = seconds;
  };
}

// Re-export Job here to avoid circular imports in decorator usage
import { Job } from './job.ts';
```

```typescript
// packages/queue/src/job.ts

import type { Container } from '@roostjs/core';
import type { JobConfig, JobMessage, SerializedJob } from './types.ts';

export abstract class Job<TPayload = void> {
  // Set by decorators. Each subclass gets its own copy via ensureConfig().
  static _jobConfig: JobConfig = {
    queue: 'default',
    maxRetries: 3,
    retryAfter: 60,
    delay: 0,
    backoff: 'fixed',
    timeout: 0,
  };

  // Set by JobConsumer before calling handle()
  protected container!: Container;
  protected attempt: number = 1;

  constructor(readonly payload: TPayload) {}

  // Subclasses must implement this.
  abstract handle(): Promise<void>;

  // Optional hooks. Subclasses override as needed.
  onFailure(_error: Error): Promise<void> | void {}
  onSuccess(): Promise<void> | void {}

  // Returns the job name used as the registry key.
  static jobName(): string {
    return this.name;
  }

  // Serialize this job class + payload for the queue message.
  static serialize<TPayload>(
    payload: TPayload,
    attempt = 1,
    chainedJobs?: SerializedJob[],
    batchId?: string,
  ): JobMessage<TPayload> {
    return {
      jobName: this.jobName(),
      payload,
      attempt,
      dispatchedAt: new Date().toISOString(),
      ...(chainedJobs ? { chainedJobs } : {}),
      ...(batchId ? { batchId } : {}),
    };
  }

  // --- Static dispatch API ---
  // These delegate to Dispatcher which is set up by QueueServiceProvider.
  // We use a late-bound reference so the dispatcher can be swapped for fakes.

  static async dispatch<TPayload>(
    this: JobConstructor<TPayload>,
    payload: TPayload,
  ): Promise<void> {
    return getDispatcher().dispatch(this, payload);
  }

  static async dispatchAfter<TPayload>(
    this: JobConstructor<TPayload>,
    seconds: number,
    payload: TPayload,
  ): Promise<void> {
    return getDispatcher().dispatchAfter(this, seconds, payload);
  }

  // chain() executes jobs sequentially: job2 only runs after job1 succeeds.
  // The chain is embedded in the first message; each job dispatches the next on success.
  static async chain(jobs: SerializedJob[]): Promise<void> {
    return getDispatcher().chain(jobs);
  }

  // batch() dispatches all jobs immediately (parallel). Optional callback
  // fires when all jobs in the batch complete.
  static async batch(
    jobs: SerializedJob[],
    onComplete?: () => Promise<void>,
  ): Promise<void> {
    return getDispatcher().batch(jobs, onComplete);
  }
}

// Type helper so dispatch() infers the correct TPayload from the subclass.
export type JobConstructor<TPayload = unknown> = {
  new (payload: TPayload): Job<TPayload>;
  _jobConfig: JobConfig;
  jobName(): string;
  serialize(
    payload: TPayload,
    attempt?: number,
    chainedJobs?: SerializedJob[],
    batchId?: string,
  ): JobMessage<TPayload>;
  dispatch(payload: TPayload): Promise<void>;
  dispatchAfter(seconds: number, payload: TPayload): Promise<void>;
};

// Module-level dispatcher reference, set by QueueServiceProvider.
// This avoids circular dependency between job.ts and dispatcher.ts.
let _dispatcher: Dispatcher | null = null;

export function setDispatcher(d: Dispatcher): void {
  _dispatcher = d;
}

export function getDispatcher(): Dispatcher {
  if (!_dispatcher) {
    throw new Error(
      'No Dispatcher registered. Ensure QueueServiceProvider is booted before dispatching jobs.',
    );
  }
  return _dispatcher;
}

// Forward declaration — Dispatcher is defined in dispatcher.ts.
export interface Dispatcher {
  dispatch<TPayload>(job: JobConstructor<TPayload>, payload: TPayload): Promise<void>;
  dispatchAfter<TPayload>(job: JobConstructor<TPayload>, seconds: number, payload: TPayload): Promise<void>;
  chain(jobs: SerializedJob[]): Promise<void>;
  batch(jobs: SerializedJob[], onComplete?: () => Promise<void>): Promise<void>;
}
```

**Key decisions**:
- Static `_jobConfig` on the base class acts as a prototype default. Decorators call `ensureConfig()` which copies the base defaults onto the subclass before writing, so two subclasses cannot share config state.
- `dispatch()` is a static method on the base class. It uses a `JobConstructor<TPayload>` typed `this` so TypeScript enforces the payload type of the specific subclass.
- The `Dispatcher` reference is module-level to avoid circular imports: `job.ts` defines the interface, `dispatcher.ts` implements it, `provider.ts` wires them.

**Implementation steps**:
1. Write `types.ts` with all shared interfaces
2. Write `job.ts` with abstract base class, static dispatch stubs, and Dispatcher interface
3. Write `decorators.ts` — each decorator calls `ensureConfig()` before writing
4. Write a test: create two subclasses with different `@Queue` names, confirm configs don't bleed between them
5. Write a test: `@MaxRetries(5)` on a subclass, verify `SubClass._jobConfig.maxRetries === 5` while `Job._jobConfig.maxRetries === 3`

**Feedback loop**:
- **Playground**: `packages/queue/__tests__/job.test.ts`
- **Experiment**: Verify decorator isolation, confirm `jobName()` returns class name, confirm `serialize()` produces correct shape.
- **Check command**: `bun test --filter job`

---

### 2. Job Registry

**Overview**: A simple `Map<string, JobConstructor>` that maps the job class name to its constructor. The consumer looks up the class at message processing time. Developers register jobs when setting up the QueueServiceProvider.

```typescript
// packages/queue/src/registry.ts

import type { JobConstructor } from './job.ts';

export class JobRegistry {
  private readonly jobs = new Map<string, JobConstructor>();

  register(jobClass: JobConstructor): this {
    this.jobs.set(jobClass.jobName(), jobClass);
    return this;
  }

  resolve(name: string): JobConstructor {
    const job = this.jobs.get(name);
    if (!job) {
      throw new UnregisteredJobError(name, [...this.jobs.keys()]);
    }
    return job;
  }

  has(name: string): boolean {
    return this.jobs.has(name);
  }
}

export class UnregisteredJobError extends Error {
  constructor(
    readonly jobName: string,
    readonly registeredJobs: string[],
  ) {
    super(
      `Job "${jobName}" is not registered. Registered jobs: [${registeredJobs.join(', ')}]`,
    );
    this.name = 'UnregisteredJobError';
  }
}
```

**Key decisions**:
- Registry uses the class's static `jobName()` return value as the key. This equals the class name by default, but can be overridden (useful for renaming jobs without breaking in-flight messages in the queue).
- The consumer receives the registry from the container. There is one global registry per application boot.

**Implementation steps**:
1. Implement `JobRegistry` with register/resolve/has
2. Test: register a job, resolve by name, resolve unknown name throws `UnregisteredJobError`

---

### 3. Retry and Backoff

**Overview**: Retry logic is separated into a pure function module. The consumer calls `calculateBackoff()` to determine delay before re-queuing. Both fixed and exponential strategies are deterministic and tested in isolation.

```typescript
// packages/queue/src/retry.ts

import type { BackoffStrategy } from './types.ts';

export interface BackoffOptions {
  strategy: BackoffStrategy;
  retryAfter: number;   // base delay in seconds
  attempt: number;      // 1-based current attempt number
  maxJitter?: number;   // optional jitter cap in seconds (default 0)
}

/**
 * Returns the number of seconds to wait before the next retry attempt.
 *
 * Fixed: always retryAfter seconds.
 * Exponential: retryAfter * 2^(attempt - 1), capped at 3600 seconds (1 hour).
 * Jitter is additive: a random value in [0, maxJitter] is added to the delay.
 */
export function calculateBackoff(options: BackoffOptions): number {
  const { strategy, retryAfter, attempt, maxJitter = 0 } = options;

  let base: number;
  if (strategy === 'exponential') {
    base = Math.min(retryAfter * Math.pow(2, attempt - 1), 3600);
  } else {
    base = retryAfter;
  }

  const jitter = maxJitter > 0 ? Math.random() * maxJitter : 0;
  return Math.ceil(base + jitter);
}

export function hasExceededMaxRetries(attempt: number, maxRetries: number): boolean {
  return attempt > maxRetries;
}
```

**Key decisions**:
- Pure function, no class — easily unit tested and readable.
- Exponential backoff is capped at 3600s (1 hour) to prevent runaway delays.
- Jitter is opt-in (default 0) so tests are deterministic. Production configurations can add jitter to spread retry spikes.

**Implementation steps**:
1. Implement `calculateBackoff` and `hasExceededMaxRetries`
2. Test: fixed strategy returns same value every attempt, exponential doubles each attempt, cap at 3600, jitter=0 is deterministic

---

### 4. Job Consumer

**Overview**: The consumer is the Wrangler `queue` handler. It receives a `MessageBatch<JobMessage>`, processes each message by looking up the job class, instantiating it with the deserialized payload, and calling `handle()`. It acknowledges messages on success and uses `retryAll()` or `ackAll()` based on the outcome.

```typescript
// packages/queue/src/consumer.ts

import type { Container } from '@roostjs/core';
import type { MessageBatch, Message } from '@cloudflare/workers-types';
import type { JobMessage, FailedJobRecord } from './types.ts';
import type { JobRegistry } from './registry.ts';
import type { JobMonitor } from './monitor.ts';
import type { FailedJobStore } from './failed-jobs.ts';
import { calculateBackoff, hasExceededMaxRetries } from './retry.ts';
import { emitJobEvent } from './events.ts';
import { setDispatcher } from './job.ts';
import { Dispatcher } from './dispatcher.ts';

export interface ConsumerOptions {
  container: Container;
  registry: JobRegistry;
  monitor: JobMonitor;
  failedJobs: FailedJobStore;
}

/**
 * Processes a Cloudflare Queues MessageBatch.
 *
 * Call this inside your Worker's `queue` export handler:
 *
 *   export default {
 *     async queue(batch, env, ctx) {
 *       await consumer.processBatch(batch);
 *     }
 *   };
 */
export class JobConsumer {
  constructor(private readonly options: ConsumerOptions) {}

  async processBatch(batch: MessageBatch<JobMessage>): Promise<void> {
    for (const message of batch.messages) {
      await this.processMessage(message);
    }
  }

  private async processMessage(message: Message<JobMessage>): Promise<void> {
    const { registry, container, monitor, failedJobs } = this.options;
    const envelope = message.body;
    const startedAt = Date.now();

    let jobClass;
    try {
      jobClass = registry.resolve(envelope.jobName);
    } catch (err) {
      // Unknown job name — cannot retry, must ack to prevent infinite loop.
      message.ack();
      await failedJobs.store({
        id: crypto.randomUUID(),
        jobName: envelope.jobName,
        payload: envelope.payload,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        attempt: envelope.attempt,
        failedAt: new Date().toISOString(),
      });
      return;
    }

    const config = jobClass._jobConfig;
    const instance = new jobClass(envelope.payload);
    (instance as { container: Container }).container = container;
    (instance as { attempt: number }).attempt = envelope.attempt;

    emitJobEvent('processing', { jobName: envelope.jobName, attempt: envelope.attempt });

    try {
      await instance.handle();

      // If this job has chained jobs, dispatch the next one.
      if (envelope.chainedJobs && envelope.chainedJobs.length > 0) {
        const [next, ...rest] = envelope.chainedJobs;
        await getDispatcher(container).dispatchChainStep(next, rest);
      }

      // If this job is part of a batch, record completion.
      if (envelope.batchId) {
        await this.options.monitor.recordBatchCompletion(envelope.batchId);
      }

      const durationMs = Date.now() - startedAt;
      await monitor.recordSuccess(envelope.jobName, durationMs);
      await instance.onSuccess();
      emitJobEvent('processed', { jobName: envelope.jobName, durationMs });

      message.ack();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      if (hasExceededMaxRetries(envelope.attempt, config.maxRetries)) {
        // Dead letter: store failed job and ack to remove from queue.
        await failedJobs.store({
          id: crypto.randomUUID(),
          jobName: envelope.jobName,
          payload: envelope.payload,
          error: error.message,
          stack: error.stack,
          attempt: envelope.attempt,
          failedAt: new Date().toISOString(),
        });
        await monitor.recordFailure(envelope.jobName);
        await instance.onFailure(error);
        emitJobEvent('failed', { jobName: envelope.jobName, error, attempt: envelope.attempt });
        message.ack();
      } else {
        // Retry: re-queue with incremented attempt count.
        const backoffSeconds = calculateBackoff({
          strategy: config.backoff,
          retryAfter: config.retryAfter,
          attempt: envelope.attempt,
        });
        emitJobEvent('retrying', { jobName: envelope.jobName, attempt: envelope.attempt, backoffSeconds });
        // Cloudflare Queues built-in retry: message.retry() tells the platform to re-deliver.
        // delaySeconds is supported as of the Queues "explicit acks" API.
        message.retry({ delaySeconds: backoffSeconds });
      }
    }
  }
}

function getDispatcher(container: Container): import('./dispatcher.ts').Dispatcher {
  return container.resolve(Symbol.for('roost.queue.dispatcher')) as import('./dispatcher.ts').Dispatcher;
}
```

**Key decisions**:
- Cloudflare Queues provides `message.ack()` and `message.retry()` with `delaySeconds` in the explicit acknowledgment API. The consumer uses explicit acks — messages are not auto-acked. This requires `queue_consumer.max_retries = 0` in `wrangler.toml` and letting the framework manage retry counts via the attempt counter in the payload.
- Unknown job names are acked (consumed) and stored to the failed job store to prevent infinite redelivery. This is a safety valve for deployments where a job class was removed while messages were in flight.
- Chain continuation is dispatched inside the consumer after `handle()` succeeds. The remaining chain steps are serialized in the message envelope, so no external state storage is needed.

**Implementation steps**:
1. Implement `JobConsumer.processBatch()` iterating messages
2. Implement `processMessage()` with happy path: resolve, instantiate, handle, ack
3. Add retry path: `message.retry({ delaySeconds })` with incremented attempt in payload
4. Add dead letter path: ack + store to `FailedJobStore`
5. Add chain continuation dispatch
6. Test: happy path acks message, failure under max retries calls retry, failure at max retries stores and acks, unknown job name acks and stores

**Feedback loop**:
- **Playground**: `packages/queue/__tests__/consumer.test.ts`
- **Experiment**: Mock `MessageBatch` with 3 messages — 2 succeed, 1 fails on first attempt. Verify 2 acks and 1 retry call. Run the same job 4 times (beyond maxRetries=3) and verify dead letter store is populated.
- **Check command**: `bun test --filter consumer`

---

### 5. Dispatcher

**Overview**: The `Dispatcher` wraps `QueueSender` from `@roostjs/cloudflare`. It serializes jobs into `JobMessage` envelopes and sends them. It handles delayed dispatch, chain initialization, and batch dispatch with KV-backed completion tracking.

```typescript
// packages/queue/src/dispatcher.ts

import type { QueueSender } from '@roostjs/cloudflare';
import type { Container } from '@roostjs/core';
import type { KVStore } from '@roostjs/cloudflare';
import type { JobMessage, SerializedJob } from './types.ts';
import type { JobRegistry } from './registry.ts';
import { emitJobEvent } from './events.ts';
import type { JobConstructor } from './job.ts';

export class Dispatcher {
  constructor(
    private readonly queues: Map<string, QueueSender<JobMessage>>,
    private readonly registry: JobRegistry,
    private readonly kv: KVStore,
  ) {}

  async dispatch<TPayload>(
    jobClass: JobConstructor<TPayload>,
    payload: TPayload,
  ): Promise<void> {
    const message = jobClass.serialize(payload);
    const sender = this.resolveSender(jobClass._jobConfig.queue);

    const delaySeconds = jobClass._jobConfig.delay > 0
      ? jobClass._jobConfig.delay
      : undefined;

    await sender.send(message, { delaySeconds });
    emitJobEvent('dispatched', { jobName: jobClass.jobName() });
  }

  async dispatchAfter<TPayload>(
    jobClass: JobConstructor<TPayload>,
    seconds: number,
    payload: TPayload,
  ): Promise<void> {
    const message = jobClass.serialize(payload);
    const sender = this.resolveSender(jobClass._jobConfig.queue);
    await sender.send(message, { delaySeconds: seconds });
    emitJobEvent('dispatched', { jobName: jobClass.jobName() });
  }

  // Initializes a job chain by dispatching the first job with the remaining
  // steps embedded in the message envelope.
  async chain(steps: SerializedJob[]): Promise<void> {
    if (steps.length === 0) return;

    const [first, ...rest] = steps;
    const jobClass = this.registry.resolve(first.jobName);
    const message = jobClass.serialize(first.payload, 1, rest);
    const sender = this.resolveSender(jobClass._jobConfig.queue);
    await sender.send(message);
    emitJobEvent('dispatched', { jobName: first.jobName });
  }

  // Dispatches the next step in a chain (called by consumer after handle() succeeds).
  async dispatchChainStep(
    next: SerializedJob,
    remaining: SerializedJob[],
  ): Promise<void> {
    const jobClass = this.registry.resolve(next.jobName);
    const message = jobClass.serialize(next.payload, 1, remaining.length > 0 ? remaining : undefined);
    const sender = this.resolveSender(jobClass._jobConfig.queue);
    await sender.send(message);
    emitJobEvent('dispatched', { jobName: next.jobName });
  }

  // Dispatches all jobs in parallel. Uses KV to track batch completion so
  // the optional callback can fire when all jobs are done.
  async batch(
    steps: SerializedJob[],
    onComplete?: () => Promise<void>,
  ): Promise<void> {
    if (steps.length === 0) return;

    const batchId = crypto.randomUUID();

    if (onComplete) {
      // Store batch metadata in KV: total count and completion callback reference.
      // The callback is identified by a KV key; completion is tracked by a counter.
      await this.kv.putJson(`roost:batch:${batchId}`, {
        total: steps.length,
        completed: 0,
        hasCallback: true,
      });
    }

    for (const step of steps) {
      const jobClass = this.registry.resolve(step.jobName);
      const message = jobClass.serialize(step.payload, 1, undefined, batchId);
      const sender = this.resolveSender(jobClass._jobConfig.queue);
      await sender.send(message);
      emitJobEvent('dispatched', { jobName: step.jobName });
    }
  }

  private resolveSender(queueName: string): QueueSender<JobMessage> {
    const sender = this.queues.get(queueName);
    if (!sender) {
      throw new Error(
        `No QueueSender registered for queue "${queueName}". ` +
        `Ensure the queue is configured in wrangler.toml and registered with QueueServiceProvider.`,
      );
    }
    return sender;
  }
}
```

**Key decisions**:
- Multiple queues are supported. Each queue name maps to a `QueueSender`. The `QueueServiceProvider` builds this map from env bindings and configuration.
- Chain state lives in the message envelope, not in KV. This is simpler, eliminates a KV read per chain step, and means chains are self-contained in the queue even if the KV binding is unavailable.
- Batch completion callback is stored as a KV marker. The consumer's `recordBatchCompletion()` increments the counter and fires the callback once `completed === total`. Note: in-process callbacks can't be serialized, so the `onComplete` pattern is documented as async side-effecting code (e.g., dispatching a follow-up job or updating state) rather than arbitrary closures.

---

### 6. Monitoring and Failed Jobs

**Overview**: Two thin KV-backed stores. `JobMonitor` records per-job-class metrics. `FailedJobStore` persists full failure records for inspection.

```typescript
// packages/queue/src/monitor.ts

import type { KVStore } from '@roostjs/cloudflare';
import type { JobMetrics } from './types.ts';

const METRICS_PREFIX = 'roost:jobs:metrics:';
const BATCH_PREFIX = 'roost:batch:';

export class JobMonitor {
  constructor(private readonly kv: KVStore) {}

  async recordSuccess(jobName: string, durationMs: number): Promise<void> {
    const key = `${METRICS_PREFIX}${jobName}`;
    const existing = await this.kv.get<JobMetrics>(key) ?? this.defaultMetrics(jobName);

    const newCount = existing.processedCount + 1;
    const newAvg = Math.round(
      (existing.avgDurationMs * existing.processedCount + durationMs) / newCount,
    );

    await this.kv.putJson<JobMetrics>(key, {
      ...existing,
      processedCount: newCount,
      avgDurationMs: newAvg,
      lastProcessedAt: new Date().toISOString(),
    });
  }

  async recordFailure(jobName: string): Promise<void> {
    const key = `${METRICS_PREFIX}${jobName}`;
    const existing = await this.kv.get<JobMetrics>(key) ?? this.defaultMetrics(jobName);
    await this.kv.putJson<JobMetrics>(key, {
      ...existing,
      failedCount: existing.failedCount + 1,
    });
  }

  async getMetrics(jobName: string): Promise<JobMetrics | null> {
    return this.kv.get<JobMetrics>(`${METRICS_PREFIX}${jobName}`);
  }

  async recordBatchCompletion(batchId: string): Promise<boolean> {
    const key = `${BATCH_PREFIX}${batchId}`;
    const batch = await this.kv.get<{ total: number; completed: number; hasCallback: boolean }>(key);
    if (!batch) return false;

    const updated = { ...batch, completed: batch.completed + 1 };
    await this.kv.putJson(key, updated);

    return updated.completed >= updated.total;
  }

  private defaultMetrics(jobName: string): JobMetrics {
    return {
      jobName,
      processedCount: 0,
      failedCount: 0,
      avgDurationMs: 0,
      lastProcessedAt: null,
    };
  }
}
```

```typescript
// packages/queue/src/failed-jobs.ts

import type { KVStore } from '@roostjs/cloudflare';
import type { FailedJobRecord } from './types.ts';

const FAILED_JOBS_PREFIX = 'roost:jobs:failed:';

export class FailedJobStore {
  constructor(private readonly kv: KVStore) {}

  async store(record: FailedJobRecord): Promise<void> {
    await this.kv.putJson(`${FAILED_JOBS_PREFIX}${record.id}`, record);
  }

  async find(id: string): Promise<FailedJobRecord | null> {
    return this.kv.get<FailedJobRecord>(`${FAILED_JOBS_PREFIX}${id}`);
  }

  async delete(id: string): Promise<void> {
    return this.kv.delete(`${FAILED_JOBS_PREFIX}${id}`);
  }

  // Lists all failed jobs. KV list is eventually consistent —
  // suitable for dashboards, not transactional logic.
  async list(): Promise<FailedJobRecord[]> {
    const result = await this.kv.list({ prefix: FAILED_JOBS_PREFIX });
    const records = await Promise.all(
      result.keys.map((k) => this.kv.get<FailedJobRecord>(k.name)),
    );
    return records.filter((r): r is FailedJobRecord => r !== null);
  }
}
```

**Key decisions**:
- KV is eventually consistent. Metrics may lag by a few milliseconds across regions. This is acceptable for monitoring but is explicitly documented in failure modes.
- Average duration is computed using a running average formula: `(oldAvg * oldCount + newDuration) / newCount`. This avoids storing individual durations and keeps the KV value small.
- Failed job IDs are UUIDs generated by the consumer at failure time. They are the KV key suffix, making them directly addressable.

---

### 7. Job Lifecycle Events

**Overview**: A minimal event emitter for job lifecycle. In tests, listeners can capture events to make assertions. In production, developers can attach listeners for logging, alerting, or audit trails.

```typescript
// packages/queue/src/events.ts

export type JobEventType = 'dispatched' | 'processing' | 'processed' | 'failed' | 'retrying';

export interface JobEventPayload {
  dispatched: { jobName: string };
  processing: { jobName: string; attempt: number };
  processed: { jobName: string; durationMs: number };
  failed: { jobName: string; error: Error; attempt: number };
  retrying: { jobName: string; attempt: number; backoffSeconds: number };
}

type JobEventListener<T extends JobEventType> = (payload: JobEventPayload[T]) => void;

const listeners = new Map<JobEventType, Set<JobEventListener<JobEventType>>>();

export function onJobEvent<T extends JobEventType>(
  event: T,
  listener: JobEventListener<T>,
): () => void {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event)!.add(listener as JobEventListener<JobEventType>);
  // Returns an unsubscribe function
  return () => listeners.get(event)?.delete(listener as JobEventListener<JobEventType>);
}

export function emitJobEvent<T extends JobEventType>(
  event: T,
  payload: JobEventPayload[T],
): void {
  listeners.get(event)?.forEach((listener) => listener(payload));
}

export function clearJobEventListeners(): void {
  listeners.clear();
}
```

---

### 8. Testing Fake

**Overview**: `Job.fake()` replaces the module-level `Dispatcher` with a `FakeDispatcher` that captures all dispatched jobs in memory instead of sending them to Cloudflare Queues. Assertions work against this in-memory log.

```typescript
// packages/queue/src/fake.ts

import type { JobConstructor, SerializedJob } from './job.ts';
import { setDispatcher } from './job.ts';
import type { Dispatcher } from './dispatcher.ts';
import type { JobMessage } from './types.ts';

interface DispatchRecord {
  jobName: string;
  payload: unknown;
  delaySeconds?: number;
  type: 'immediate' | 'delayed' | 'chain' | 'batch';
}

class FakeDispatcher implements Dispatcher {
  readonly dispatched: DispatchRecord[] = [];

  async dispatch<TPayload>(job: JobConstructor<TPayload>, payload: TPayload): Promise<void> {
    this.dispatched.push({ jobName: job.jobName(), payload, type: 'immediate' });
  }

  async dispatchAfter<TPayload>(
    job: JobConstructor<TPayload>,
    seconds: number,
    payload: TPayload,
  ): Promise<void> {
    this.dispatched.push({
      jobName: job.jobName(),
      payload,
      delaySeconds: seconds,
      type: 'delayed',
    });
  }

  async chain(jobs: SerializedJob[]): Promise<void> {
    jobs.forEach((j) =>
      this.dispatched.push({ jobName: j.jobName, payload: j.payload, type: 'chain' }),
    );
  }

  async batch(jobs: SerializedJob[]): Promise<void> {
    jobs.forEach((j) =>
      this.dispatched.push({ jobName: j.jobName, payload: j.payload, type: 'batch' }),
    );
  }

  async dispatchChainStep(next: SerializedJob, _remaining: SerializedJob[]): Promise<void> {
    this.dispatched.push({ jobName: next.jobName, payload: next.payload, type: 'chain' });
  }
}

let fakeInstance: FakeDispatcher | null = null;

export const JobFake = {
  fake(): FakeDispatcher {
    fakeInstance = new FakeDispatcher();
    setDispatcher(fakeInstance);
    return fakeInstance;
  },

  restore(): void {
    fakeInstance = null;
  },

  assertDispatched<TPayload>(
    jobClass: JobConstructor<TPayload>,
    assert?: (payload: TPayload) => boolean,
  ): void {
    const name = jobClass.jobName();
    const matches = fakeInstance?.dispatched.filter((d) => d.jobName === name) ?? [];
    if (matches.length === 0) {
      throw new Error(`Expected job "${name}" to be dispatched, but it was not.`);
    }
    if (assert) {
      const passed = matches.some((m) => assert(m.payload as TPayload));
      if (!passed) {
        throw new Error(
          `Expected job "${name}" to be dispatched with matching payload, but no match found.`,
        );
      }
    }
  },

  assertNotDispatched<TPayload>(jobClass: JobConstructor<TPayload>): void {
    const name = jobClass.jobName();
    const count = fakeInstance?.dispatched.filter((d) => d.jobName === name).length ?? 0;
    if (count > 0) {
      throw new Error(`Expected job "${name}" to NOT be dispatched, but it was dispatched ${count} time(s).`);
    }
  },

  assertDispatchedCount<TPayload>(jobClass: JobConstructor<TPayload>, times: number): void {
    const name = jobClass.jobName();
    const count = fakeInstance?.dispatched.filter((d) => d.jobName === name).length ?? 0;
    if (count !== times) {
      throw new Error(
        `Expected job "${name}" to be dispatched ${times} time(s), but was dispatched ${count} time(s).`,
      );
    }
  },
};
```

**Key decisions**:
- `Job.fake()` is a module-level function (not a static on `Job` itself) to avoid coupling the base class to test infrastructure. This follows the same pattern as `@roostjs/testing` will use for other fakes.
- The `FakeDispatcher` is also returned from `fake()` so tests can inspect `fakeInstance.dispatched` directly if the assertion helpers don't cover their use case.
- `restore()` should be called in `afterEach` to prevent test pollution.

**Feedback loop**:
- **Playground**: `packages/queue/__tests__/fake.test.ts`
- **Experiment**: `JobFake.fake()`, dispatch `SendEmail`, assert dispatched, confirm real queue sender was never called.
- **Check command**: `bun test --filter fake`

---

### 9. Service Provider

**Overview**: `QueueServiceProvider` extends `ServiceProvider` from `@roostjs/core`. It registers the `JobRegistry`, `Dispatcher`, `JobMonitor`, `FailedJobStore`, and wires the module-level dispatcher reference.

```typescript
// packages/queue/src/provider.ts

import { ServiceProvider } from '@roostjs/core';
import { QueueSender } from '@roostjs/cloudflare';
import { JobRegistry } from './registry.ts';
import { Dispatcher } from './dispatcher.ts';
import { JobMonitor } from './monitor.ts';
import { FailedJobStore } from './failed-jobs.ts';
import { setDispatcher } from './job.ts';
import type { JobMessage } from './types.ts';

export interface QueueServiceProviderOptions {
  // Map of queue names to their Wrangler binding names in env.
  // e.g. { default: 'MY_QUEUE', emails: 'EMAIL_QUEUE' }
  queues: Record<string, string>;
  // KV binding name for job metrics and failed job storage.
  kv: string;
}

export class QueueServiceProvider extends ServiceProvider {
  constructor(
    app: Application,
    private readonly opts: QueueServiceProviderOptions,
  ) {
    super(app);
  }

  register(): void {
    this.app.container.singleton(JobRegistry, () => new JobRegistry());
    this.app.container.singleton(JobMonitor, (c) => {
      const kv = this.app.env[this.opts.kv] as KVNamespace;
      return new JobMonitor(new KVStore(kv));
    });
    this.app.container.singleton(FailedJobStore, (c) => {
      const kv = this.app.env[this.opts.kv] as KVNamespace;
      return new FailedJobStore(new KVStore(kv));
    });
    this.app.container.singleton(Dispatcher, (c) => {
      const senders = new Map<string, QueueSender<JobMessage>>();
      for (const [name, bindingKey] of Object.entries(this.opts.queues)) {
        const binding = this.app.env[bindingKey] as Queue<JobMessage>;
        senders.set(name, new QueueSender(binding));
      }
      return new Dispatcher(
        senders,
        c.resolve(JobRegistry),
        new KVStore(this.app.env[this.opts.kv] as KVNamespace),
      );
    });
    this.app.container.singleton(JobConsumer, (c) =>
      new JobConsumer({
        container: this.app.container,
        registry: c.resolve(JobRegistry),
        monitor: c.resolve(JobMonitor),
        failedJobs: c.resolve(FailedJobStore),
      }),
    );
  }

  boot(): void {
    // Wire the module-level dispatcher so Job.dispatch() works from anywhere.
    const dispatcher = this.app.container.resolve(Dispatcher);
    setDispatcher(dispatcher);
  }
}
```

**User setup** (in their `worker.ts`):

```typescript
import { Application } from '@roostjs/core';
import { QueueServiceProvider } from '@roostjs/queue';
import { JobConsumer } from '@roostjs/queue';
import { SendWelcomeEmail } from './jobs/send-welcome-email.ts';

const app = Application.create(env);
const provider = new QueueServiceProvider(app, {
  queues: { default: 'DEFAULT_QUEUE' },
  kv: 'JOBS_KV',
});
provider.register();
provider.boot();

// Register all job classes
const registry = app.container.resolve(JobRegistry);
registry.register(SendWelcomeEmail);

export default {
  async fetch(request: Request, env: Env) {
    return app.handle(request);
  },
  async queue(batch: MessageBatch<JobMessage>, env: Env) {
    const consumer = app.container.resolve(JobConsumer);
    await consumer.processBatch(batch);
  },
};
```

---

## Data Model

No D1 schema. All persistence is KV-based.

| KV Key Pattern | Value Shape | Purpose |
|---|---|---|
| `roost:jobs:metrics:{jobName}` | `JobMetrics` JSON | Per-class processed/failed counts and avg duration |
| `roost:jobs:failed:{uuid}` | `FailedJobRecord` JSON | Failed job records for inspection |
| `roost:batch:{uuid}` | `{ total, completed, hasCallback }` JSON | Batch completion tracking |

## API Design

### Dispatch (developer-facing)

```typescript
// Immediate dispatch
await SendWelcomeEmail.dispatch({ userId: '123', email: 'user@example.com' });

// Delayed dispatch
await SendWelcomeEmail.dispatchAfter(300, { userId: '123', email: 'user@example.com' });

// Chain (sequential)
await Job.chain([
  { jobName: 'ProcessPayment', payload: { orderId: 'ord_1' } },
  { jobName: 'SendOrderConfirmation', payload: { orderId: 'ord_1' } },
  { jobName: 'UpdateInventory', payload: { orderId: 'ord_1' } },
]);

// Batch (parallel)
await Job.batch([
  { jobName: 'ResizeImage', payload: { imageId: 'img_1', size: 'thumb' } },
  { jobName: 'ResizeImage', payload: { imageId: 'img_1', size: 'medium' } },
  { jobName: 'ResizeImage', payload: { imageId: 'img_1', size: 'large' } },
]);
```

### Job Definition (developer-facing)

```typescript
import { Job, Queue, MaxRetries, RetryAfter, Backoff } from '@roostjs/queue';

interface EmailPayload {
  userId: string;
  email: string;
  templateId: string;
}

@Queue('emails')
@MaxRetries(5)
@RetryAfter(30)
@Backoff('exponential')
export class SendWelcomeEmail extends Job<EmailPayload> {
  async handle(): Promise<void> {
    // this.payload is typed as EmailPayload
    // this.container is available for DI
    const mailer = this.container.resolve(MailerService);
    await mailer.send(this.payload.email, this.payload.templateId);
  }

  override async onFailure(error: Error): Promise<void> {
    console.error(`Failed to send welcome email to ${this.payload.email}:`, error);
  }
}
```

### Metrics Query (internal / future dashboard)

```typescript
const monitor = container.resolve(JobMonitor);
const metrics = await monitor.getMetrics('SendWelcomeEmail');
// { jobName: 'SendWelcomeEmail', processedCount: 1420, failedCount: 3, avgDurationMs: 142, lastProcessedAt: '...' }
```

## Testing Requirements

### Unit Tests

| Test File | Coverage |
|---|---|
| `packages/queue/__tests__/job.test.ts` | Decorator isolation, serialize shape, default config values |
| `packages/queue/__tests__/dispatcher.test.ts` | Dispatch sends to correct queue, dispatchAfter sets delay, chain embeds remaining steps, batch sets batchId |
| `packages/queue/__tests__/consumer.test.ts` | Happy path acks, retry on failure, dead letter at max retries, unknown job name dead-letters, chain continuation, batch completion tracking |
| `packages/queue/__tests__/monitor.test.ts` | recordSuccess increments count and updates avg, recordFailure increments failed count, running average is correct |
| `packages/queue/__tests__/fake.test.ts` | fake() captures dispatched jobs, assertDispatched passes and fails correctly, assertNotDispatched, restore() clears state |

**Key test cases**:
- Two job subclasses with different `@MaxRetries` values do not share config state
- `calculateBackoff` with `exponential` doubles each attempt, caps at 3600
- Consumer: message with `attempt: 4` and `maxRetries: 3` goes to dead letter store, not retry
- Consumer: chain message with 2 remaining steps dispatches next step after handle()
- `JobFake.assertDispatched(SendWelcomeEmail, (p) => p.email === 'test@example.com')` passes only when payload matches

## Error Handling

| Error Scenario | Handling Strategy |
|---|---|
| Unknown job name in message | Ack message, store in FailedJobStore with error noting unregistered job name |
| Job `handle()` throws | Retry with backoff if under maxRetries; dead letter + ack if at maxRetries |
| No QueueSender for queue name | Throw at dispatch time with message naming the missing queue |
| Dispatcher not set (forgot to boot) | Throw with actionable message pointing to QueueServiceProvider |
| KV unavailable during metric write | Log error, do not re-throw — metrics writes should not fail job processing |
| Batch KV counter missing on completion | Return false from `recordBatchCompletion`, log warning, no crash |
| Payload exceeds 128KB Queues limit | Validate before send, throw `PayloadTooLargeError` with size info |

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
|---|---|---|---|---|
| Consumer | Retry storm | Many jobs fail simultaneously | Queue congestion, rate limits | Exponential backoff with jitter; configure `@Backoff('exponential')` |
| Consumer | Job class removed mid-flight | Deploy removes a job class while messages are in queue | Dead letter all in-flight messages for that class | Monitor failed jobs after deploys; registry logs unregistered name |
| Monitor | KV write-after-write race | Two consumers process same job class simultaneously | Metrics count may be slightly off | Acceptable for monitoring; document KV eventual consistency |
| Dispatcher | Module-level dispatcher not set | Boot not called, or called after dispatch | Runtime throw | Provider.boot() sets dispatcher; Application boot order is deterministic |
| Chain | Handle() crashes mid-chain | Job 2 of 3 fails at max retries | Chain stops; job 3 never runs | onFailure() hook receives error; chain failure is logged with remaining steps |
| Batch | batchId KV missing | KV TTL expired or key deleted | Completion callback never fires | Set KV TTL for batch keys (7 days default); document this limitation |

## Validation Commands

```bash
# Type checking
bun run --filter @roostjs/queue tsc --noEmit

# Unit tests
bun test --filter packages/queue

# Build
bun run --filter @roostjs/queue build

# Full suite
bun test
```
