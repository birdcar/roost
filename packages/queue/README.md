# @roostjs/queue

Background job processing on Cloudflare Queues. Define jobs as classes, dispatch them with one line, and configure retry behavior with decorators.

Part of [Roost](https://roost.birdcar.dev) — the Laravel of Cloudflare Workers.

## Installation

```bash
bun add @roostjs/queue
```

## Quick Start

```ts
import { Job, Queue, MaxRetries, Backoff } from '@roostjs/queue';

@Queue('emails')
@MaxRetries(5)
@Backoff('exponential')
class SendWelcomeEmail extends Job<{ userId: string; email: string }> {
  async handle() {
    await sendEmail(this.payload.email, 'Welcome!');
  }

  onFailure(error: Error) {
    console.error('Failed to send welcome email:', error.message);
  }
}

// Dispatch from anywhere
await SendWelcomeEmail.dispatch({ userId: '123', email: 'user@example.com' });

// Dispatch with a delay
await SendWelcomeEmail.dispatchAfter(60, { userId: '123', email: 'user@example.com' });
```

## Features

- `Job` base class with typed `payload` and `attempt`
- `dispatch()` and `dispatchAfter(seconds)` static methods
- `chain()` for sequential job pipelines
- `batch()` to dispatch a group of jobs with a shared batch ID
- Configurable per-job retry behavior: `@MaxRetries`, `@RetryAfter`, `@Backoff('fixed' | 'exponential')`
- `@Queue(name)` routes jobs to specific CF Queue bindings
- `@Delay(seconds)` sets a default dispatch delay
- `@JobTimeout(seconds)` documents expected max duration
- `onSuccess()` and `onFailure()` optional hooks per job
- `JobConsumer` handles CF Queue message batches, including retry with calculated backoff
- `Job.fake()` / `Job.assertDispatched()` for zero-infrastructure testing

## API

### Job decorators

```ts
@Queue('my-queue')        // which CF Queue binding to send to (default: 'default')
@MaxRetries(3)            // max attempts before ack-ing a failed message (default: 3)
@RetryAfter(60)           // base retry delay in seconds (default: 60)
@Backoff('exponential')   // 'fixed' | 'exponential' (default: 'fixed')
@Delay(30)                // default dispatch delay in seconds (default: 0)
@JobTimeout(120)          // informational timeout hint in seconds
class MyJob extends Job<MyPayload> {
  async handle() { /* ... */ }
}
```

### Dispatching

```ts
// Immediate
await MyJob.dispatch(payload)

// Delayed
await MyJob.dispatchAfter(seconds, payload)

// Sequential chain — each job runs after the previous succeeds
await Job.chain([
  { jobClass: FetchData, payload: { url } },
  { jobClass: ProcessData, payload: {} },
  { jobClass: NotifyUser, payload: { userId } },
])

// Batch — all dispatched at once, grouped by a shared batchId
const batchId = await Job.batch([
  { jobClass: SendEmail, payload: { to: 'a@example.com' } },
  { jobClass: SendEmail, payload: { to: 'b@example.com' } },
])
```

### Consumer (wrangler.toml queue handler)

```ts
import { JobConsumer, JobRegistry } from '@roostjs/queue';

const registry = new JobRegistry();
registry.register(SendWelcomeEmail);
registry.register(ProcessData);

const consumer = new JobConsumer(registry);

// In your CF Worker queue handler:
export default {
  async queue(batch: MessageBatch, env: Env) {
    await consumer.processBatch(batch.messages);
  }
}
```

### Testing

```ts
SendWelcomeEmail.fake();

await someServiceThatDispatchesEmail();

SendWelcomeEmail.assertDispatched();             // at least one dispatched
SendWelcomeEmail.assertDispatched('SendWelcomeEmail');  // by name
SendWelcomeEmail.assertNotDispatched();          // none dispatched

SendWelcomeEmail.restore();
```

## Documentation

Full documentation at [roost.birdcar.dev/docs/reference/queue](https://roost.birdcar.dev/docs/reference/queue)

## License

MIT
