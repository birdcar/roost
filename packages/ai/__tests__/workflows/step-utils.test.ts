import { describe, it, expect } from 'bun:test';
import { withRetries, branch, sequence } from '../../src/workflows/step-utils.js';
import type { WorkflowStep } from 'cloudflare:workers';

function fakeStep(): WorkflowStep & { calls: Array<{ name: string }> } {
  const calls: Array<{ name: string }> = [];
  const step = {
    calls,
    async do<T>(name: string, maybeConfigOrFn: unknown, maybeFn?: () => Promise<T>): Promise<T> {
      calls.push({ name });
      const fn = typeof maybeConfigOrFn === 'function' ? (maybeConfigOrFn as () => Promise<T>) : maybeFn!;
      return fn();
    },
    async sleep() {},
    async sleepUntil() {},
    async waitForEvent() {
      return {} as never;
    },
  };
  return step as unknown as WorkflowStep & { calls: Array<{ name: string }> };
}

describe('withRetries', () => {
  it('wraps fn in step.do and returns its result', async () => {
    const step = fakeStep();
    const result = await withRetries(step, 'fetch-data', async () => 42);
    expect(result).toBe(42);
    expect(step.calls[0].name).toBe('fetch-data');
  });
});

describe('branch', () => {
  it('dispatches to the matching branch and tags the step name', async () => {
    const step = fakeStep();
    const result = await branch(step, 'route', 'yes', {
      yes: async () => 'picked-yes',
      no: async () => 'picked-no',
    });
    expect(result).toBe('picked-yes');
    expect(step.calls[0].name).toBe('route:yes');
  });

  it('throws when no matching branch is registered', async () => {
    const step = fakeStep();
    await expect(
      branch(step, 'route', 'missing' as 'yes' | 'no', {
        yes: async () => 'a',
        no: async () => 'b',
      }),
    ).rejects.toThrow("No branch registered for discriminant 'missing'");
  });
});

describe('sequence', () => {
  it('runs tasks in order and collects results', async () => {
    const step = fakeStep();
    const results = await sequence(step, 'batch', [
      { label: 'first', fn: async () => 1 },
      { label: 'second', fn: async () => 2 },
    ]);
    expect(results).toEqual([1, 2]);
    expect(step.calls.map((c) => c.name)).toEqual(['batch:first', 'batch:second']);
  });
});
