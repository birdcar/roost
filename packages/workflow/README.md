# @roostjs/workflow

Durable execution on Cloudflare Workflows. Extends `WorkflowEntrypoint` with a clean base class, a typed client, and a saga pattern for compensating multi-step operations.

Part of [Roost](https://roost.birdcar.dev) — the Laravel of Cloudflare Workers.

## Installation

```bash
bun add @roostjs/workflow
```

## Quick Start

```ts
import { Workflow, WorkflowClient, Compensable } from '@roostjs/workflow';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

interface ProvisionParams {
  orgId: string;
  plan: string;
}

export class ProvisionOrg extends Workflow<Env, ProvisionParams> {
  async run(event: WorkflowEvent<ProvisionParams>, step: WorkflowStep) {
    const saga = new Compensable();

    const org = await step.do('create-org', async () => {
      const o = await createOrg(event.payload.orgId);
      saga.register(() => deleteOrg(o.id));
      return o;
    });

    await step.do('send-welcome-email', async () => {
      await sendWelcome(org.id, event.payload.plan);
    });
  }
}

// Trigger from any Worker handler
const client = new WorkflowClient<ProvisionParams>(env.PROVISION_ORG);
const handle = await client.create({ params: { orgId: '123', plan: 'pro' } });
const status = await handle.status();
```

## Features

- `Workflow` base class extending CF's `WorkflowEntrypoint` with `fake()` / assert helpers
- `WorkflowClient` typed wrapper around the CF Workflow binding
- `Compensable` for saga-style rollback: register compensation functions as you go, call `compensate()` on failure to run them in reverse
- `WorkflowError` and `NonRetryableError` for step-level error handling
- `Workflow.fake()` / `Workflow.assertCreated()` for unit testing without CF infrastructure

## API

### Workflow

```ts
abstract class Workflow<Env, TParams> extends WorkflowEntrypoint<Env, TParams> {
  abstract run(event: WorkflowEvent<TParams>, step: WorkflowStep): Promise<unknown>
}
```

Static testing helpers:

```ts
ProvisionOrg.fake()
ProvisionOrg.restore()
ProvisionOrg.assertCreated(id?)      // asserts at least one (or specific) workflow was created
ProvisionOrg.assertNotCreated()
```

### WorkflowClient

```ts
const client = new WorkflowClient<TParams>(binding)

client.create({ id?, params })    // => WorkflowInstanceHandle
client.get(id)                    // => WorkflowInstanceHandle
client.terminate(id)
```

`WorkflowInstanceHandle` exposes `id`, `pause()`, `resume()`, `abort(reason?)`, and `status()` which returns `{ status, output?, error? }`.

Possible status values: `'queued' | 'running' | 'paused' | 'complete' | 'errored' | 'terminated'`.

### Compensable (saga pattern)

```ts
const saga = new Compensable();

// Register compensations as each step succeeds
saga.register(async () => await rollbackStep());

// On failure, run all registered compensations in reverse order
await saga.compensate();
```

Compensations run best-effort — a failing compensation does not block the others.

### Errors

```ts
import { WorkflowError, NonRetryableError } from '@roostjs/workflow';

// Throw NonRetryableError inside a step to skip CF's retry logic
throw new NonRetryableError('Payment declined — not retrying');
```

## Documentation

Full documentation at [roost.birdcar.dev/docs/reference/workflow](https://roost.birdcar.dev/docs/reference/workflow)

## License

MIT
