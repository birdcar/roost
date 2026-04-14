import { describe, test, expect, beforeEach, mock } from 'bun:test';

// Mock cloudflare:workers before any imports that depend on it
mock.module('cloudflare:workers', () => {
  class WorkflowEntrypoint<Env = unknown, TParams = unknown> {
    protected env!: Env;
    protected ctx!: unknown;
  }

  return { WorkflowEntrypoint };
});

// Mock cloudflare:workflows for NonRetryableError
mock.module('cloudflare:workflows', () => {
  class NonRetryableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'NonRetryableError';
    }
  }

  return { NonRetryableError };
});

// Now import our modules
import { WorkflowFake } from '../src/testing.js';
import { Compensable } from '../src/compensable.js';
import { WorkflowClient } from '../src/client.js';

// ─── Inline Workflow subclass for testing ────────────────────────────────────
// We import Workflow after the mock is set up
const { Workflow } = await import('../src/workflow.js');

interface TestParams {
  value: string;
}

class TestWorkflow extends Workflow<unknown, TestParams> {
  async run() {
    return { done: true };
  }
}

class AnotherWorkflow extends Workflow<unknown, TestParams> {
  async run() {
    return { done: true };
  }
}

// ─── WorkflowFake ─────────────────────────────────────────────────────────────

describe('WorkflowFake', () => {
  test('recordCreate stores records', () => {
    const fake = new WorkflowFake();
    fake.recordCreate('id-1', { value: 'a' });
    expect(fake.created).toHaveLength(1);
    expect(fake.created[0].id).toBe('id-1');
    expect(fake.created[0].params).toEqual({ value: 'a' });
    expect(fake.created[0].createdAt).toBeInstanceOf(Date);
  });

  test('assertCreated passes when at least one record exists', () => {
    const fake = new WorkflowFake();
    fake.recordCreate('id-1', {});
    expect(() => fake.assertCreated()).not.toThrow();
  });

  test('assertCreated throws when no records exist', () => {
    const fake = new WorkflowFake();
    expect(() => fake.assertCreated()).toThrow('Expected at least one workflow to be created, but none were');
  });

  test('assertCreated(id) passes when id is found', () => {
    const fake = new WorkflowFake();
    fake.recordCreate('order-123', {});
    expect(() => fake.assertCreated('order-123')).not.toThrow();
  });

  test('assertCreated(id) throws with informative message when id not found', () => {
    const fake = new WorkflowFake();
    fake.recordCreate('order-456', {});
    expect(() => fake.assertCreated('order-123')).toThrow(
      'Expected workflow to be created with id "order-123", but it was not. Created: ["order-456"]'
    );
  });

  test('assertNotCreated passes when no records exist', () => {
    const fake = new WorkflowFake();
    expect(() => fake.assertNotCreated()).not.toThrow();
  });

  test('assertNotCreated throws when records exist', () => {
    const fake = new WorkflowFake();
    fake.recordCreate('id-1', {});
    expect(() => fake.assertNotCreated()).toThrow('Expected no workflows to be created, but 1 were created');
  });
});

// ─── Workflow.fake() / restore() / assert* ────────────────────────────────────

describe('Workflow.fake()', () => {
  beforeEach(() => {
    TestWorkflow.restore();
    AnotherWorkflow.restore();
  });

  test('fake() sets up fake state', () => {
    TestWorkflow.fake();
    expect(TestWorkflow._getFake()).toBeInstanceOf(WorkflowFake);
  });

  test('restore() removes the fake', () => {
    TestWorkflow.fake();
    TestWorkflow.restore();
    expect(TestWorkflow._getFake()).toBeUndefined();
  });

  test('fakes are per-class — do not bleed between classes', () => {
    TestWorkflow.fake();
    expect(AnotherWorkflow._getFake()).toBeUndefined();
  });

  test('assertCreated() passes when fake has records', () => {
    TestWorkflow.fake();
    TestWorkflow._getFake()!.recordCreate('id-1', {});
    expect(() => TestWorkflow.assertCreated()).not.toThrow();
  });

  test('assertCreated(id) passes when specific id was created', () => {
    TestWorkflow.fake();
    TestWorkflow._getFake()!.recordCreate('order-99', {});
    expect(() => TestWorkflow.assertCreated('order-99')).not.toThrow();
  });

  test('assertCreated(id) throws when id not found', () => {
    TestWorkflow.fake();
    expect(() => TestWorkflow.assertCreated('missing-id')).toThrow('Expected workflow to be created with id "missing-id"');
  });

  test('assertCreated() throws when fake() was not called', () => {
    expect(() => TestWorkflow.assertCreated()).toThrow('TestWorkflow.fake() was not called');
  });

  test('assertNotCreated() passes when no records', () => {
    TestWorkflow.fake();
    expect(() => TestWorkflow.assertNotCreated()).not.toThrow();
  });

  test('assertNotCreated() throws when records exist', () => {
    TestWorkflow.fake();
    TestWorkflow._getFake()!.recordCreate('id-1', {});
    expect(() => TestWorkflow.assertNotCreated()).toThrow('Expected no workflows to be created');
  });

  test('assertNotCreated() throws when fake() was not called', () => {
    expect(() => TestWorkflow.assertNotCreated()).toThrow('TestWorkflow.fake() was not called');
  });
});

// ─── WorkflowClient ───────────────────────────────────────────────────────────

describe('WorkflowClient', () => {
  function makeMockInstance(id: string) {
    return {
      id,
      pause: mock(async () => {}),
      resume: mock(async () => {}),
      terminate: mock(async () => {}),
      status: mock(async () => ({ status: 'running' as const })),
    };
  }

  function makeMockBinding(instanceId = 'gen-uuid') {
    const instance = makeMockInstance(instanceId);
    const binding = {
      create: mock(async (_opts: unknown) => instance),
      get: mock(async (_id: string) => instance),
    };
    return { binding, instance };
  }

  test('create() with explicit id uses the provided id', async () => {
    const { binding, instance } = makeMockBinding('explicit-id');
    instance.id = 'explicit-id';
    const client = new WorkflowClient(binding as never);
    const handle = await client.create({ id: 'explicit-id', params: { value: 'test' } });
    expect(handle.id).toBe('explicit-id');
    expect(binding.create).toHaveBeenCalledWith({ id: 'explicit-id', params: { value: 'test' } });
  });

  test('create() without id passes undefined to the binding', async () => {
    const { binding } = makeMockBinding('auto-id');
    const client = new WorkflowClient(binding as never);
    const handle = await client.create({ params: { value: 'test' } });
    expect(handle.id).toBe('auto-id');
    expect(binding.create).toHaveBeenCalledWith({ id: undefined, params: { value: 'test' } });
  });

  test('terminate() calls terminate() on the underlying instance', async () => {
    const { binding, instance } = makeMockBinding('term-id');
    const client = new WorkflowClient(binding as never);
    await client.terminate('term-id');
    expect(binding.get).toHaveBeenCalledWith('term-id');
    expect(instance.terminate).toHaveBeenCalled();
  });

  test('get() returns a wrapped handle', async () => {
    const { binding } = makeMockBinding('fetch-id');
    const client = new WorkflowClient(binding as never);
    const handle = await client.get('fetch-id');
    expect(handle.id).toBe('fetch-id');
  });
});

// ─── Compensable ──────────────────────────────────────────────────────────────

describe('Compensable', () => {
  test('compensations run in reverse order', async () => {
    const order: number[] = [];
    const comp = new Compensable();
    comp.register(() => { order.push(1); });
    comp.register(() => { order.push(2); });
    comp.register(() => { order.push(3); });
    await comp.compensate();
    expect(order).toEqual([3, 2, 1]);
  });

  test('all compensations run even if one throws', async () => {
    const ran: string[] = [];
    const comp = new Compensable();
    comp.register(() => { ran.push('first'); });
    comp.register(() => { throw new Error('boom'); });
    comp.register(() => { ran.push('third'); });
    await comp.compensate();
    expect(ran).toContain('first');
    expect(ran).toContain('third');
  });

  test('compensate() clears the compensation list (idempotent)', async () => {
    let calls = 0;
    const comp = new Compensable();
    comp.register(() => { calls++; });
    await comp.compensate();
    await comp.compensate();
    expect(calls).toBe(1);
  });

  test('async compensations are awaited', async () => {
    const resolved: boolean[] = [];
    const comp = new Compensable();
    comp.register(async () => {
      await Promise.resolve();
      resolved.push(true);
    });
    await comp.compensate();
    expect(resolved).toHaveLength(1);
  });
});

// ─── WorkflowServiceProvider ──────────────────────────────────────────────────

describe('WorkflowServiceProvider', () => {
  test('resolves FakeWorkflowClient when workflow is faked', async () => {
    const { WorkflowServiceProvider } = await import('../src/provider.js');
    const { Application } = await import('@roost/core');

    TestWorkflow.fake();

    const app = new Application();
    new WorkflowServiceProvider(app).withWorkflows([
      { workflowClass: TestWorkflow as never, binding: 'TEST_WORKFLOW' },
    ]).register();

    const client = app.container.resolve<{ create: Function }>('workflow:TestWorkflow');
    expect(client).toBeDefined();

    // FakeWorkflowClient.create() should record in the fake
    await client.create({ params: { value: 'hello' } });
    TestWorkflow.assertCreated();

    TestWorkflow.restore();
  });

  test('resolves real WorkflowClient when not faked (mock CF binding)', async () => {
    const { WorkflowServiceProvider } = await import('../src/provider.js');
    const { Application } = await import('@roost/core');

    const mockBinding = {
      create: mock(async () => ({
        id: 'real-id',
        pause: async () => {},
        resume: async () => {},
        abort: async () => {},
        status: async () => ({ status: 'queued' as const }),
      })),
      get: mock(async (_id: string) => ({
        id: 'real-id',
        pause: async () => {},
        resume: async () => {},
        abort: async () => {},
        status: async () => ({ status: 'queued' as const }),
      })),
    };

    const app = new Application();
    app.container.bind('TEST_WORKFLOW_REAL', () => mockBinding);
    new WorkflowServiceProvider(app).withWorkflows([
      { workflowClass: AnotherWorkflow as never, binding: 'TEST_WORKFLOW_REAL' },
    ]).register();

    const client = app.container.resolve<WorkflowClient<TestParams>>('workflow:AnotherWorkflow');
    expect(client).toBeInstanceOf(WorkflowClient);
  });
});

// ─── NonRetryableError re-export ──────────────────────────────────────────────

describe('NonRetryableError re-export', () => {
  test('imports from @roost/workflow without error', async () => {
    const { NonRetryableError } = await import('../src/errors.js');
    const err = new NonRetryableError('permanent failure');
    expect(err.message).toBe('permanent failure');
    expect(err.name).toBe('NonRetryableError');
  });

  test('WorkflowError includes workflowId', async () => {
    const { WorkflowError } = await import('../src/errors.js');
    const err = new WorkflowError('something failed', 'wf-123');
    expect(err.message).toBe('something failed');
    expect(err.workflowId).toBe('wf-123');
    expect(err.name).toBe('WorkflowError');
  });
});
