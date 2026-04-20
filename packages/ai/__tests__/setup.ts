import { mock } from 'bun:test';

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
