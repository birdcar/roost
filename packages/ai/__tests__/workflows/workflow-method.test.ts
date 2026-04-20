import { describe, it, expect, beforeEach, mock } from 'bun:test';

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

const methodModule = await import('../../src/workflows/workflow-method.js');
const { Workflow, WorkflowClientNotRegisteredError, getWorkflowRegistrations, _clearWorkflowRegistrations } =
  methodModule;
import type { WorkflowCreateParams, WorkflowInstanceHandle } from '@roostjs/workflow';

class FakeClient {
  created: Array<{ params: unknown; id: string }> = [];

  async create(params: WorkflowCreateParams<unknown>): Promise<WorkflowInstanceHandle> {
    const id = params.id ?? `wf-${this.created.length + 1}`;
    this.created.push({ params: params.params, id });
    return {
      id,
      pause: async () => {},
      resume: async () => {},
      abort: async () => {},
      status: async () => ({ status: 'queued' as const }),
    };
  }
  async get(id: string): Promise<WorkflowInstanceHandle> {
    return {
      id,
      pause: async () => {},
      resume: async () => {},
      abort: async () => {},
      status: async () => ({ status: 'queued' as const }),
    };
  }
  async terminate(_id: string): Promise<void> {}
}

describe('@Workflow decorator', () => {
  beforeEach(() => {
    _clearWorkflowRegistrations();
  });

  it('registers the entrypoint metadata with a derived binding name', () => {
    class Reports {
      @Workflow()
      async process(_step: unknown, reportId: string): Promise<string> {
        return `processed:${reportId}`;
      }
    }
    void Reports;

    const reg = getWorkflowRegistrations().get('REPORTS_PROCESS');
    expect(reg).toBeDefined();
    expect(reg!.methodName).toBe('process');
    expect(reg!.agentClass).toBe(Reports);
    expect(typeof reg!.originalMethod).toBe('function');
  });

  it('supports a custom binding name via opts.binding', () => {
    class Reports {
      @Workflow({ binding: 'REPORT_FLOW' })
      async archive(_step: unknown): Promise<void> {}
    }
    void Reports;
    expect(getWorkflowRegistrations().has('REPORT_FLOW')).toBe(true);
  });

  it('rewrites the method to dispatch via the workflow client', async () => {
    class Reports {
      workflows = new Map<string, FakeClient>();

      @Workflow({ binding: 'REPORT_FLOW' })
      async process(_step: unknown, reportId: string): Promise<string> {
        return `processed:${reportId}`;
      }
    }

    const agent = new Reports();
    const client = new FakeClient();
    agent.workflows.set('REPORT_FLOW', client);

    const handle = await (agent.process as unknown as (id: string) => Promise<{ workflowId: string }>)('r-1');
    expect(handle.workflowId).toBe('wf-1');
    expect(client.created[0].params).toEqual({ method: 'process', args: ['r-1'] });
  });

  it('throws WorkflowClientNotRegisteredError when the binding is missing', async () => {
    class Reports {
      workflows = new Map<string, FakeClient>();
      @Workflow({ binding: 'MISSING' })
      async process(_step: unknown): Promise<void> {}
    }
    const agent = new Reports();
    await expect(agent.process()).rejects.toThrow(WorkflowClientNotRegisteredError);
  });

  it('generated entrypoint class invokes original method with step injected as first arg', async () => {
    let capturedStep: unknown;
    let capturedArgs: unknown[] = [];
    class Reports {
      @Workflow({ binding: 'ECHO_FLOW' })
      async echo(step: unknown, a: number, b: string): Promise<string> {
        capturedStep = step;
        capturedArgs = [a, b];
        return `${a}:${b}`;
      }
    }
    void Reports;

    const reg = getWorkflowRegistrations().get('ECHO_FLOW')!;
    const fakeStep = { do: async (_name: string, fn: () => unknown) => fn() };
    const result = await reg.originalMethod.call(null, fakeStep, 7, 'hi');
    expect(result).toBe('7:hi');
    expect(capturedStep).toBe(fakeStep);
    expect(capturedArgs).toEqual([7, 'hi']);
  });

  it('throws TypeError when applied to non-method descriptors', () => {
    expect(() => {
      const decorator = Workflow();
      decorator({}, 'bogus', { value: 'not a function' } as PropertyDescriptor);
    }).toThrow(TypeError);
  });
});
