import { describe, it, expect, mock } from 'bun:test';

mock.module('cloudflare:workers', () => {
  class WorkflowEntrypoint<Env = unknown, TParams = unknown> {
    protected env!: Env;
    protected ctx!: unknown;
  }
  return { WorkflowEntrypoint };
});
mock.module('cloudflare:workflows', () => {
  class NonRetryableError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'NonRetryableError';
    }
  }
  return { NonRetryableError };
});

const clientModule = await import('../../src/workflows/workflow-client.js');
const { AgentWorkflowClient } = clientModule;
import type { WorkflowClient } from '@roostjs/workflow';

class StubUnderlying {
  public createdParams: unknown;
  public getCalls: string[] = [];
  public terminateCalls: string[] = [];

  async create(params: { id?: string; params: unknown }) {
    this.createdParams = params;
    return makeHandle(params.id ?? 'wf-1');
  }
  async get(id: string) {
    this.getCalls.push(id);
    return makeHandle(id);
  }
  async terminate(id: string) {
    this.terminateCalls.push(id);
  }
}

function makeHandle(id: string) {
  return {
    id,
    pause: async () => {},
    resume: async () => {},
    abort: async () => {},
    status: async () => ({ status: 'queued' as const }),
  };
}

describe('AgentWorkflowClient', () => {
  it('delegates create to the underlying WorkflowClient', async () => {
    const stub = new StubUnderlying();
    const client = new AgentWorkflowClient(stub as unknown as WorkflowClient<unknown>);
    const handle = await client.create({ params: { method: 'run', args: [1] } });
    expect(handle.id).toBe('wf-1');
    expect(stub.createdParams).toEqual({ params: { method: 'run', args: [1] } });
  });

  it('delegates get and terminate', async () => {
    const stub = new StubUnderlying();
    const client = new AgentWorkflowClient(stub as unknown as WorkflowClient<unknown>);
    const handle = await client.get('wf-42');
    expect(handle.id).toBe('wf-42');
    await client.terminate('wf-42');
    expect(stub.getCalls).toEqual(['wf-42']);
    expect(stub.terminateCalls).toEqual(['wf-42']);
  });
});
