import { describe, it, expect } from 'bun:test';
import { AIClient } from './ai.js';

function makeAiBinding(result: unknown = 'response text'): Ai {
  return {
    run: async (_model: string, _inputs: unknown, _opts?: unknown) => result,
  } as unknown as Ai;
}

describe('AIClient', () => {
  describe('run()', () => {
    it('returns the binding result normally', async () => {
      const client = new AIClient(makeAiBinding('hello'));
      const result = await client.run<string>('@cf/meta/llama-3.1-8b-instruct', { messages: [] });
      expect(result).toBe('hello');
    });

    it('passes queueRequest flag through to the underlying binding', async () => {
      let capturedOpts: unknown;
      const ai = {
        run: async (_model: string, _inputs: unknown, opts?: unknown) => {
          capturedOpts = opts;
          return { id: 'task-abc' };
        },
      } as unknown as Ai;

      const client = new AIClient(ai);
      await client.run('@cf/meta/llama-3.1-8b-instruct', {}, { queueRequest: true });

      expect((capturedOpts as Record<string, unknown>)['queueRequest']).toBe(true);
    });

    it('returns { id: string } shape when queueRequest is true', async () => {
      const client = new AIClient(makeAiBinding({ id: 'task-xyz' }));
      const result = await client.run('@cf/meta/llama-3.1-8b-instruct', {}, { queueRequest: true });
      expect(result).toEqual({ id: 'task-xyz' });
    });
  });

  describe('poll()', () => {
    it('calls the correct task status URL', async () => {
      const accountId = 'acc123';
      const taskId = 'task-abc';
      let calledUrl = '';

      const mockFetch = async (url: string) => {
        calledUrl = url;
        return new Response(
          JSON.stringify({ result: { status: 'running' }, success: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      };

      const client = new AIClient(makeAiBinding());
      await client.poll(taskId, mockFetch as unknown as typeof fetch, accountId);

      expect(calledUrl).toBe(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/tasks/${taskId}`,
      );
    });

    it('returns { status: "running" } when task is incomplete', async () => {
      const mockFetch = async () =>
        new Response(
          JSON.stringify({ result: { status: 'running' }, success: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );

      const client = new AIClient(makeAiBinding());
      const result = await client.poll('task-1', mockFetch as unknown as typeof fetch, 'acc');

      expect(result).toEqual({ status: 'running' });
    });

    it('returns { status: "done", result } when task is complete', async () => {
      const mockFetch = async () =>
        new Response(
          JSON.stringify({ result: { status: 'done', output: 'final answer' }, success: true }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );

      const client = new AIClient(makeAiBinding());
      const result = await client.poll<string>('task-1', mockFetch as unknown as typeof fetch, 'acc');

      expect(result).toEqual({ status: 'done', result: 'final answer' });
    });
  });
});
