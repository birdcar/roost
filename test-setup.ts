/**
 * Repo-root test preload. Stubs Cloudflare virtual modules so tests that
 * transitively import `@roostjs/workflow` (via `@roostjs/ai`'s StatefulAgent,
 * for example) can evaluate outside the Workers runtime.
 *
 * Each package may still register its own preload (e.g. `packages/ai`
 * preloads `happy-dom` for client tests); those stack on top of this one.
 */
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
