// Re-export CF's NonRetryableError so consumers don't need to import from cloudflare:workflows
export { NonRetryableError } from 'cloudflare:workflows';

export class WorkflowError extends Error {
  constructor(message: string, public readonly workflowId?: string) {
    super(message);
    this.name = 'WorkflowError';
  }
}
