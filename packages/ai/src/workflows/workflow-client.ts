import { WorkflowClient } from '@roostjs/workflow';
import type {
  WorkflowCreateParams,
  WorkflowInstanceHandle,
  WorkflowInstanceStatus,
} from '@roostjs/workflow';

/**
 * Handle returned from calling an `@Workflow`-decorated agent method. Wraps a
 * `WorkflowInstanceHandle` and surfaces the `workflowId` for introspection.
 */
export interface WorkflowStartHandle {
  readonly workflowId: string;
  status(): Promise<WorkflowInstanceStatus>;
  abort(reason?: string): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
}

/**
 * Typed wrapper over `@roostjs/workflow`'s `WorkflowClient`. Scopes the client
 * to the payload shape agent workflows emit (`{method, args}`) so consumers
 * do not have to carry the generic themselves.
 */
export class AgentWorkflowClient<TParams = unknown> {
  constructor(private readonly client: WorkflowClient<TParams>) {}

  static fromBinding<TParams = unknown>(binding: Workflow<TParams>): AgentWorkflowClient<TParams> {
    return new AgentWorkflowClient(new WorkflowClient<TParams>(binding));
  }

  async create(params: WorkflowCreateParams<TParams>): Promise<WorkflowInstanceHandle> {
    return this.client.create(params);
  }

  async get(id: string): Promise<WorkflowInstanceHandle> {
    return this.client.get(id);
  }

  async terminate(id: string): Promise<void> {
    return this.client.terminate(id);
  }
}
