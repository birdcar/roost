import { ServiceProvider } from '@roostjs/core';
import { WorkflowClient } from './client.js';
import type { Workflow } from './workflow.js';
import type { WorkflowFake } from './testing.js';
import type { WorkflowCreateParams, WorkflowInstanceHandle } from './types.js';

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

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const binding = this.app.container.resolve(bindingName) as any;
        return new WorkflowClient(binding);
      });
    }
  }
}

class FakeWorkflowClient {
  constructor(
    private readonly workflowClass: typeof Workflow,
    private readonly fake: WorkflowFake
  ) {}

  async create(params: WorkflowCreateParams): Promise<WorkflowInstanceHandle> {
    const id = params.id ?? crypto.randomUUID();
    this.fake.recordCreate(id, params.params);
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
