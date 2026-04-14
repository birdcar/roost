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
