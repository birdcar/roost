import type { WorkflowCreateParams, WorkflowInstanceHandle, WorkflowInstanceStatus } from './types.js';

// The CF Workflow binding and WorkflowInstance are global types provided by @cloudflare/workers-types
export class WorkflowClient<TParams = unknown> {
  constructor(private readonly binding: Workflow<TParams>) {}

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
    await instance.terminate();
  }

  private wrapInstance(instance: WorkflowInstance): WorkflowInstanceHandle {
    return {
      id: instance.id,
      pause: () => instance.pause(),
      resume: () => instance.resume(),
      abort: (_reason) => instance.terminate(),
      status: async () => {
        const s = await instance.status();
        return s as unknown as WorkflowInstanceStatus;
      },
    };
  }
}
