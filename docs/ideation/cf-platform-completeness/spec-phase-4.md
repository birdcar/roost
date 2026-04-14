# Phase 4: Workflows (Durable Execution)

**Initiative**: CF Platform Completeness
**Phase**: 4
**Status**: Ready to implement
**Blocked by**: Phase 1 (Production Foundations — needs `app.defer()` / `waitUntil()` threading)
**Can run in parallel with**: Phases 2, 5, 6, 7, 8

---

## Overview

Add `@roost/workflow` — a Roost abstraction over Cloudflare Workflows (durable execution on SQLite-backed Durable Objects). Follows the same fake/assert testing pattern as `@roost/queue`, the `ServiceProvider` registration pattern from `@roost/core`, and the `make:*` CLI generator pattern from `@roost/cli`.

Workflows differ from queue jobs: they are stateful, durable, multi-step executions with guaranteed progress (checkpoints after every step). Jobs are fire-and-forget; Workflows survive Worker restarts and resume from the last completed step.

---

## Technical Approach

### Platform constraints
- `WorkflowEntrypoint` is a Durable Object subclass — must be exported from the Worker entry point
- Step results checkpoint to SQLite; 1 MiB per result, 1024 steps per execution, 128 MB memory
- Retry: 5 attempts with exponential backoff per step by default; override via step options
- `NonRetryableError` halts retries immediately
- `step.waitForEvent()` suspends execution until an external event is sent to the workflow instance
- Workflows must be declared in `wrangler.jsonc` under `"workflows"` — cannot be auto-discovered at runtime

### Design decisions
- `Workflow<TParams>` extends `WorkflowEntrypoint<Env, TParams>` — the `run()` method is the entry point
- `this.step` is the native CF step handle passed to `run(ctx, event)` — expose it directly, no wrapping needed (the CF SDK already provides the clean API)
- `WorkflowClient<T>` is a thin typed wrapper over the CF Workflow binding; injected via `WorkflowServiceProvider`
- Compensation pattern: `Compensable` base class tracks completed operations and runs compensations in reverse on error
- Testing: static `fake()`/`restore()` pattern matching `Job` exactly — `WorkflowFake` records `create()` calls and step executions against an in-memory registry

---

## File Changes

### New files

| File | Purpose |
|------|---------|
| `packages/workflow/package.json` | Package manifest |
| `packages/workflow/tsconfig.json` | TypeScript config |
| `packages/workflow/src/workflow.ts` | `Workflow` base class |
| `packages/workflow/src/compensable.ts` | `Compensable` mixin for saga rollback |
| `packages/workflow/src/client.ts` | `WorkflowClient<TParams>` typed wrapper |
| `packages/workflow/src/provider.ts` | `WorkflowServiceProvider` |
| `packages/workflow/src/errors.ts` | `WorkflowError`, re-export `NonRetryableError` |
| `packages/workflow/src/types.ts` | Shared types |
| `packages/workflow/src/index.ts` | Package exports |
| `packages/workflow/src/testing.ts` | `WorkflowFake` implementation |
| `packages/workflow/tests/workflow.test.ts` | Unit tests |

### Modified files

| File | Change |
|------|--------|
| `packages/cli/src/commands/make.ts` | Add `makeWorkflow()` function |
| `packages/cli/src/index.ts` | Add `make:workflow` case + help entry |

---

## Implementation Details

### `packages/workflow/package.json`

```json
{
  "name": "@roost/workflow",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "peerDependencies": {
    "@cloudflare/workers-types": "*",
    "@roost/core": "workspace:*"
  }
}
```

### `packages/workflow/tsconfig.json`

Mirror the pattern used by `packages/queue/tsconfig.json` — `strict: true`, `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`.

### `packages/workflow/src/types.ts`

```typescript
export interface WorkflowCreateParams<TParams = unknown> {
  id?: string;
  params: TParams;
}

export interface WorkflowInstanceHandle {
  id: string;
  pause(): Promise<void>;
  resume(): Promise<void>;
  abort(reason?: string): Promise<void>;
  status(): Promise<WorkflowInstanceStatus>;
}

export type WorkflowInstanceStatus = {
  status: 'queued' | 'running' | 'paused' | 'complete' | 'errored' | 'terminated';
  output?: unknown;
  error?: string;
};
```

### `packages/workflow/src/errors.ts`

```typescript
// Re-export CF's NonRetryableError so consumers don't need to import from cloudflare:workers
export { NonRetryableError } from 'cloudflare:workers';

export class WorkflowError extends Error {
  constructor(message: string, public readonly workflowId?: string) {
    super(message);
    this.name = 'WorkflowError';
  }
}
```

`NonRetryableError` from `cloudflare:workers` immediately halts step retries. Re-exporting it here keeps consumer imports within `@roost/workflow` and avoids leaking CF internals.

### `packages/workflow/src/workflow.ts`

```typescript
import { WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import type { WorkflowFake } from './testing.js';

const fakes = new WeakMap<Function, WorkflowFake>();

export abstract class Workflow<Env = unknown, TParams = unknown>
  extends WorkflowEntrypoint<Env, TParams> {

  abstract run(event: WorkflowEvent<TParams>, step: WorkflowStep): Promise<unknown>;

  static fake(): void {
    // import lazily to keep production bundle free of test code
    const { WorkflowFake } = await import('./testing.js');  // see note below
    fakes.set(this, new WorkflowFake());
  }

  static restore(): void {
    fakes.delete(this);
  }

  static assertCreated(id?: string): void {
    const fake = fakes.get(this);
    if (!fake) throw new Error(`${this.name}.fake() was not called`);
    fake.assertCreated(id);
  }

  static _getFake(): WorkflowFake | undefined {
    return fakes.get(this);
  }
}
```

Note on lazy import: to avoid bundling test utilities in production, `fake()` uses a dynamic import. Alternatively (and simpler), the fake import is a static top-level import behind a `/* @__PURE__ */` comment pattern — match whatever approach `@roost/queue` uses. The key constraint is that `fake()` and `restore()` only live in test contexts.

Simpler alternative matching the Job pattern exactly (static imports, same file structure):

```typescript
import { WorkflowFake } from './testing.js';

const fakes = new WeakMap<Function, WorkflowFake>();

export abstract class Workflow<Env = unknown, TParams = unknown>
  extends WorkflowEntrypoint<Env, TParams> {

  abstract run(event: WorkflowEvent<TParams>, step: WorkflowStep): Promise<unknown>;

  static fake(): void {
    fakes.set(this, new WorkflowFake());
  }

  static restore(): void {
    fakes.delete(this);
  }

  static assertCreated(id?: string): void {
    const fake = fakes.get(this);
    if (!fake) throw new Error(`${this.name}.fake() was not called`);
    fake.assertCreated(id);
  }

  static assertNotCreated(): void {
    const fake = fakes.get(this);
    if (!fake) throw new Error(`${this.name}.fake() was not called`);
    fake.assertNotCreated();
  }

  static _getFake(): WorkflowFake | undefined {
    return fakes.get(this);
  }
}
```

**Use the simpler approach** — matches the `Job` pattern exactly, no dynamic imports, tree-shaking handles exclusion.

### `packages/workflow/src/testing.ts`

```typescript
export interface FakeWorkflowRecord {
  id: string;
  params: unknown;
  createdAt: Date;
}

export class WorkflowFake {
  public created: FakeWorkflowRecord[] = [];

  recordCreate(id: string, params: unknown): void {
    this.created.push({ id, params, createdAt: new Date() });
  }

  assertCreated(id?: string): void {
    if (id) {
      const found = this.created.some((r) => r.id === id);
      if (!found) {
        throw new Error(
          `Expected workflow to be created with id "${id}", but it was not. Created: ${JSON.stringify(this.created.map((r) => r.id))}`
        );
      }
    } else {
      if (this.created.length === 0) {
        throw new Error('Expected at least one workflow to be created, but none were');
      }
    }
  }

  assertNotCreated(): void {
    if (this.created.length > 0) {
      throw new Error(
        `Expected no workflows to be created, but ${this.created.length} were created`
      );
    }
  }
}
```

### `packages/workflow/src/client.ts`

`WorkflowClient<TParams>` wraps the CF Workflow binding so consumers get type-safe `create()`, `get()`, and `terminate()` without touching the raw binding.

```typescript
import type { Workflow as CFWorkflow } from 'cloudflare:workers';
import type { WorkflowCreateParams, WorkflowInstanceHandle, WorkflowInstanceStatus } from './types.js';
import { WorkflowError } from './errors.js';
import type { WorkflowFake } from './testing.js';

export class WorkflowClient<TParams = unknown> {
  constructor(private readonly binding: CFWorkflow) {}

  async create(params: WorkflowCreateParams<TParams>): Promise<WorkflowInstanceHandle> {
    const instance = await this.binding.create({
      id: params.id,
      params: params.params,
    });
    return this.wrapInstance(instance);
  }

  async get(id: string): Promise<WorkflowInstanceHandle> {
    const instance = await this.binding.get(id);
    return this.wrapInstance(instance);
  }

  async terminate(id: string): Promise<void> {
    const instance = await this.binding.get(id);
    await instance.abort();
  }

  private wrapInstance(instance: WorkflowInstance): WorkflowInstanceHandle {
    return {
      id: instance.id,
      pause: () => instance.pause(),
      resume: () => instance.resume(),
      abort: (reason) => instance.abort(reason),
      status: async () => {
        const s = await instance.status();
        return s as WorkflowInstanceStatus;
      },
    };
  }
}
```

**Fake integration on `WorkflowClient`**: When a Workflow class is faked, the `WorkflowServiceProvider` should resolve a `FakeWorkflowClient` instead of the real binding-backed client. See provider section below.

### `packages/workflow/src/compensable.ts`

The `Compensable` class provides a saga-style compensation pattern. Subclass it alongside `Workflow` (or use it inside a `run()` method directly).

```typescript
type CompensationFn = () => Promise<void> | void;

export class Compensable {
  private compensations: CompensationFn[] = [];

  protected register(compensation: CompensationFn): void {
    this.compensations.push(compensation);
  }

  protected async compensate(): Promise<void> {
    const toRun = [...this.compensations].reverse();
    this.compensations = [];
    for (const fn of toRun) {
      try {
        await fn();
      } catch {
        // best-effort; log but continue
      }
    }
  }
}
```

Usage pattern in a workflow:

```typescript
export class OrderFulfillmentWorkflow extends Workflow<Env, OrderParams> {
  private compensable = new Compensable();

  async run(event: WorkflowEvent<OrderParams>, step: WorkflowStep) {
    try {
      const reservation = await step.do('reserve-inventory', async () => {
        const result = await reserveInventory(event.payload.orderId);
        this.compensable.register(() => releaseInventory(result.reservationId));
        return result;
      });

      await step.do('charge-payment', async () => {
        const charge = await chargeCard(event.payload.paymentMethodId);
        this.compensable.register(() => refundCharge(charge.chargeId));
        return charge;
      });

      await step.do('fulfill-order', async () => {
        return fulfillOrder(event.payload.orderId, reservation.reservationId);
      });
    } catch (err) {
      await this.compensable.compensate();
      throw err;
    }
  }
}
```

Note: `Compensable` is a plain class, not a mixin, because TypeScript mixins with abstract classes require awkward constructor typing. Composition via `private compensable = new Compensable()` is idiomatic and avoids the issue entirely.

### `packages/workflow/src/provider.ts`

```typescript
import { ServiceProvider } from '@roost/core';
import { WorkflowClient } from './client.js';
import type { Workflow } from './workflow.js';

export class WorkflowServiceProvider extends ServiceProvider {
  private workflowClasses: Array<typeof Workflow> = [];
  private workflowBindings: Record<string, string> = {};

  withWorkflows(
    workflows: Array<{ workflowClass: typeof Workflow; binding: string }>
  ): this {
    for (const { workflowClass, binding } of workflows) {
      this.workflowClasses.push(workflowClass);
      this.workflowBindings[workflowClass.name] = binding;
    }
    return this;
  }

  register(): void {
    for (const workflowClass of this.workflowClasses) {
      const bindingName = this.workflowBindings[workflowClass.name];

      this.app.container.singleton(`workflow:${workflowClass.name}`, () => {
        const fake = workflowClass._getFake();
        if (fake) {
          return new FakeWorkflowClient(workflowClass, fake);
        }

        const binding = this.app.container.resolve(bindingName);
        return new WorkflowClient(binding);
      });
    }
  }
}

class FakeWorkflowClient {
  constructor(
    private readonly workflowClass: typeof Workflow,
    private readonly fake: import('./testing.js').WorkflowFake
  ) {}

  async create(params: import('./types.js').WorkflowCreateParams): Promise<import('./types.js').WorkflowInstanceHandle> {
    const id = params.id ?? crypto.randomUUID();
    this.fake.recordCreate(id, params.params);
    return {
      id,
      pause: async () => {},
      resume: async () => {},
      abort: async () => {},
      status: async () => ({ status: 'queued' }),
    };
  }

  async get(id: string): Promise<import('./types.js').WorkflowInstanceHandle> {
    return {
      id,
      pause: async () => {},
      resume: async () => {},
      abort: async () => {},
      status: async () => ({ status: 'queued' }),
    };
  }

  async terminate(_id: string): Promise<void> {}
}
```

### `packages/workflow/src/index.ts`

```typescript
export { Workflow } from './workflow.js';
export { Compensable } from './compensable.js';
export { WorkflowClient } from './client.js';
export { WorkflowServiceProvider } from './provider.js';
export { WorkflowError, NonRetryableError } from './errors.js';
export type {
  WorkflowCreateParams,
  WorkflowInstanceHandle,
  WorkflowInstanceStatus,
} from './types.js';
```

---

## CLI Generator: `roost make:workflow`

### `packages/cli/src/commands/make.ts` — add `makeWorkflow()`

```typescript
export async function makeWorkflow(name: string): Promise<void> {
  const pascal = toPascalCase(name);
  const kebab = toKebabCase(name);

  const content = `import { Workflow, Compensable, NonRetryableError } from '@roost/workflow';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';

interface ${pascal}Params {
  // Define workflow input parameters
}

export class ${pascal}Workflow extends Workflow<Env, ${pascal}Params> {
  private compensable = new Compensable();

  async run(event: WorkflowEvent<${pascal}Params>, step: WorkflowStep) {
    try {
      const result = await step.do('step-one', async () => {
        // Implement step logic here.
        // Register a compensation if this step has side effects:
        // this.compensable.register(() => undoStepOne(result));
        return { done: true };
      });

      await step.sleep('wait-before-step-two', '1 minute');

      await step.do('step-two', async () => {
        // Steps may retry up to 5 times with exponential backoff.
        // Throw NonRetryableError for permanent failures:
        // throw new NonRetryableError('Unrecoverable condition');
      });
    } catch (err) {
      await this.compensable.compensate();
      throw err;
    }
  }
}
`;

  await writeIfNotExists(join('src', 'workflows', `${kebab}.ts`), content);
}
```

### `packages/cli/src/index.ts` — add case and help entry

In the `switch` block, add after `make:job`:

```typescript
case 'make:workflow':
  if (!positional[0]) { console.error('Usage: roost make:workflow <Name>'); process.exit(1); }
  await makeWorkflow(positional[0]);
  break;
```

In `printHelp()`, add to the make section:

```
    make:workflow <Name>  Generate a durable workflow class
```

---

## `wrangler.jsonc` Binding Pattern

Workflows must be declared in `wrangler.jsonc`. The `class_name` must match the exported class name exactly. `script_name` is only required for cross-Worker bindings.

```jsonc
{
  "workflows": [
    {
      "name": "order-fulfillment",
      "binding": "ORDER_FULFILLMENT_WORKFLOW",
      "class_name": "OrderFulfillmentWorkflow"
      // "script_name": "my-other-worker"  // only for cross-Worker bindings
    }
  ]
}
```

The exported class in the Worker entry point (`src/index.ts` or `src/worker.ts`) must re-export the workflow class:

```typescript
// src/worker.ts
export { OrderFulfillmentWorkflow } from './workflows/order-fulfillment.js';
```

`WorkflowServiceProvider` registration in `bootstrap/providers.ts`:

```typescript
import { OrderFulfillmentWorkflow } from '../src/workflows/order-fulfillment.js';

new WorkflowServiceProvider(app).withWorkflows([
  { workflowClass: OrderFulfillmentWorkflow, binding: 'ORDER_FULFILLMENT_WORKFLOW' },
]);
```

Triggering from a Worker or route handler:

```typescript
const client = app.container.resolve<WorkflowClient<OrderParams>>('workflow:OrderFulfillmentWorkflow');

const instance = await client.create({
  id: `order-${orderId}`,  // idempotency key — same id returns existing instance
  params: { orderId, paymentMethodId },
});

const { status } = await instance.status();
```

---

## Testing Requirements

### Unit tests: `packages/workflow/tests/workflow.test.ts`

Cover all of the following:

**`Workflow` fake/assert API**
- `fake()` intercepts `WorkflowClient.create()` without touching CF bindings
- `assertCreated()` passes when at least one instance was created
- `assertCreated(id)` passes when a specific id was created
- `assertCreated(id)` throws with informative message when id not found
- `assertNotCreated()` passes when no instances were created
- `assertNotCreated()` throws when instances exist
- `restore()` removes the fake and subsequent creates would hit the real client

**`WorkflowClient`**
- `create()` with explicit `id` uses the provided id
- `create()` without `id` generates a uuid
- `terminate()` calls `abort()` on the underlying instance

**`Compensable`**
- Compensations run in reverse order
- All compensations run even if one throws (best-effort)
- `compensate()` clears the compensation list (idempotent)

**`WorkflowServiceProvider`**
- Resolves `FakeWorkflowClient` when workflow is faked
- Resolves real `WorkflowClient` when not faked (mock the CF binding)

**`NonRetryableError`** re-export
- Import from `@roost/workflow` resolves without error

---

## Error Handling

### Step-level errors

CF Workflows retry each step up to 5 times with exponential backoff by default. Override at the step level:

```typescript
await step.do('idempotent-op', { retries: { limit: 3, delay: '5 seconds', backoff: 'exponential' } }, async () => {
  // ...
});
```

For permanent failures (invalid input, unrecoverable state), throw `NonRetryableError`:

```typescript
import { NonRetryableError } from '@roost/workflow';

throw new NonRetryableError('Order already fulfilled — cannot reprocess');
```

### Compensation errors

`Compensable.compensate()` catches and swallows individual compensation errors (best-effort). In a production workflow, log failures before swallowing:

```typescript
protected async compensate(): Promise<void> {
  const toRun = [...this.compensations].reverse();
  this.compensations = [];
  for (const fn of toRun) {
    try {
      await fn();
    } catch (err) {
      // TODO: plug into @roost/observability logger once Phase 1 is complete
      console.error('Compensation failed:', err);
    }
  }
}
```

### Idempotency

Every `step.do()` call checkpoints its result. If a step has already completed and the workflow resumes (e.g., after a Worker restart), CF will return the checkpointed result without re-executing the function body. Design side effects to be idempotent anyway — use idempotency keys on external API calls, upsert rather than insert in the DB.

---

## Failure Modes

| Failure | Behavior |
|---------|----------|
| Step throws retryable error | CF retries up to 5× with exponential backoff |
| Step throws `NonRetryableError` | Workflow transitions to `errored`, no retries |
| Step result exceeds 1 MiB | CF throws `RangeError` — reduce step output size |
| Workflow exceeds 1024 steps | CF throws — decompose into sub-workflows or consolidate steps |
| `create()` called with existing id | CF returns the existing instance (idempotent) — desired behavior for deduplication |
| Compensation throws | Logged, swallowed, remaining compensations continue |
| Worker binding not found at boot | `WorkflowServiceProvider.register()` skips silently (matches `QueueServiceProvider` pattern) |
| `fake()` not called before `assertCreated()` | Throws `"WorkflowName.fake() was not called"` |

---

## Validation Commands

```bash
# Run workflow-specific tests
bun test --filter workflow

# Typecheck the workflow package
cd packages/workflow && bun run typecheck

# Typecheck the CLI (after adding make:workflow)
cd packages/cli && bun run typecheck

# Full repo typecheck
bun run typecheck
```

---

## Step Design Reference

Guidelines for step boundaries (derived from CF architecture guide):

| Rule | Rationale |
|------|-----------|
| One side effect per step | Steps retry atomically — multiple writes in one step risk partial execution |
| Bundle reads freely | Reads without side effects are safe to group; no checkpointing cost |
| Isolate writes | Each external write (DB insert, API call, email send) gets its own step |
| Register compensation before returning | `Compensable.register()` must be called inside the step fn, before the step returns, so it is recorded before the checkpoint |
| Use idempotency keys | Step body may execute more than once on retry; external APIs should receive stable keys |
| Prefer `step.sleep()` over `setTimeout` | `setTimeout` does not survive Worker restarts; `step.sleep()` is durable |

---

## Dependencies

No new external dependencies. The `cloudflare:workers` module is a virtual module provided by the Workers runtime — declare it as a `devDependency` via `@cloudflare/workers-types` peer dep. All other imports are from `@roost/core` (already a peer dep on all packages).
