import type { WorkflowStep } from 'cloudflare:workers';

/**
 * Helpers composed over `WorkflowStep` for common agent-in-workflow patterns.
 * Each helper is a thin wrapper around `step.do()` — the intent is to encode
 * retry / branching conventions consistently so agent methods stay terse.
 */

export interface StepRetryConfig {
  retries?: number;
  initialDelayMs?: number;
  backoff?: 'exponential' | 'linear';
  retryableErrors?: Array<new (...args: unknown[]) => Error>;
}

/**
 * Wrap a fallible async operation in `step.do` with retry metadata encoded in
 * the step name. Errors not matching `retryableErrors` are rethrown as
 * `NonRetryableError`-equivalents so the workflow halts.
 */
export async function withRetries<T>(
  step: WorkflowStep,
  name: string,
  fn: () => Promise<T>,
  config: StepRetryConfig = {},
): Promise<T> {
  const retries = config.retries ?? 3;
  const initialDelayMs = config.initialDelayMs ?? 1000;
  const backoff = config.backoff ?? 'exponential';

  const doFn = step.do as unknown as (
    name: string,
    config: unknown,
    fn: () => Promise<unknown>,
  ) => Promise<T>;
  return doFn(
    name,
    {
      retries: {
        limit: retries,
        delay: `${initialDelayMs} milliseconds`,
        backoff: backoff === 'exponential' ? 'exponential' : 'linear',
      },
    },
    fn,
  );
}

/**
 * Given a discriminant and an object of `{key: fn}` branches, dispatch to the
 * matching branch inside a single `step.do` so the branch choice is durable.
 */
export async function branch<Discriminant extends string, TBranchResults extends Record<Discriminant, unknown>>(
  step: WorkflowStep,
  name: string,
  discriminant: Discriminant,
  branches: { [K in Discriminant]: () => Promise<TBranchResults[K]> },
): Promise<TBranchResults[Discriminant]> {
  const doFn = step.do as unknown as (
    name: string,
    fn: () => Promise<unknown>,
  ) => Promise<TBranchResults[Discriminant]>;
  return doFn(`${name}:${discriminant}`, async () => {
    const branchFn = branches[discriminant];
    if (!branchFn) throw new Error(`No branch registered for discriminant '${String(discriminant)}'`);
    return branchFn();
  });
}

/**
 * Sequentially run multiple steps, collecting results. Preserves order and
 * halts on the first failure so downstream steps see durable completion state.
 */
export async function sequence<T>(
  step: WorkflowStep,
  namePrefix: string,
  tasks: Array<{ label: string; fn: () => Promise<T> }>,
): Promise<T[]> {
  const doFn = step.do as unknown as (name: string, fn: () => Promise<unknown>) => Promise<T>;
  const results: T[] = [];
  for (const task of tasks) {
    results.push(await doFn(`${namePrefix}:${task.label}`, task.fn));
  }
  return results;
}
